'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { quotationCommandSchema } from '@business-os/core/commercial';
import { safeFailure, DomainError } from '@business-os/shared';
import { commercialServices } from '../commercial/service';

const createInput = z
  .object({
    clientName: z.string().trim().min(2).max(200),
    customerId: z.uuid().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    phone: z.string().trim().min(3).max(40),
    email: z.union([z.literal(''), z.email().max(254)]),
    projectName: z.string().trim().min(2).max(200),
    location: z.string().trim().max(200),
    projectType: z.string().trim().min(2).max(100),
    plotSize: z.string().trim().max(40),
    industryKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('INR'),
  })
  .strict();

/**
 * Real quote creation from entered client and project data.
 *
 * Saves a customer, its project and then a signed, versioned draft using
 * existing tenant permission-enforced RPCs. It does not issue a quote and
 * never use elevated credentials to bypass a user's create permissions.
 */
export async function createStudioQuotation(input: unknown): Promise<{
  ok: boolean;
  message: string;
  revisionId?: string;
}> {
  try {
    const values = createInput.parse(input);
    const s = await commercialServices('quotation.create', 'quotation');
    if (
      !(
        s.allowed('customer.create', 'crm') ||
        s.allowed('customer.create', 'quotation')
      ) ||
      !s.allowed('project.create', 'projects')
    )
      throw new DomainError('FORBIDDEN');

    const { data: activeIndustry, error: industryError } = await s.client
      .from('industries')
      .select('id,key')
      .eq('key', values.industryKey)
      .eq('status', 'active')
      .maybeSingle();
    if (industryError || !activeIndustry)
      return { ok: false, message: 'Select an active company industry.' };

    const {
      data: { user },
      error: authError,
    } = await s.client.auth.getUser();
    if (authError || !user) throw new DomainError('FORBIDDEN');

    // Quote settings must exist so the draft captures the proper tenant name.
    const { data: settings, error: settingsError } = await s.client
      .from('organization_quotation_settings')
      .select('id')
      .eq('organization_id', s.org)
      .maybeSingle();
    if (settingsError || !settings)
      return {
        ok: false,
        message:
          'Company quotation branding is not configured yet. Open Quotation Settings to finish setup.',
      };

    // A broken Hostinger/database signing-key pair used to create customer
    // and project records and only then reject the final quotation. Verify
    // the same attestation up front so retries are safe and actionable.
    try {
      await s.commercial.assertSigningReady(s.org);
    } catch {
      return {
        ok: false,
        message:
          'Quotation security verification failed before saving. Please ask the platform administrator to check that Hostinger QUOTATION_SIGNING_KEY matches the Supabase quotation signing key, then sign in again.',
      };
    }

    // The CRN belongs to a customer, not to a quotation. Reuse the existing
    // customer/project whenever selected; never manufacture another customer
    // for a known phone or email address.
    const baseAddress = {
      line1: '',
      line2: '',
      city: values.location,
      region: '',
      postal_code: '',
      country_code: 'IN',
    };

    let customerId = values.customerId ?? '';
    if (customerId) {
      const { data: existing, error } = await s.client
        .from('customers')
        .select('id')
        .eq('organization_id', s.org)
        .eq('id', customerId)
        .eq('status', 'active')
        .maybeSingle();
      if (error || !existing)
        return { ok: false, message: 'The selected customer is not available in your company.' };
    } else {
      const lookups = [
        s.client.from('customers')
          .select('id,display_name')
          .eq('organization_id', s.org)
          .eq('phone', values.phone)
          .limit(5),
        ...(values.email ? [
          s.client.from('customers')
            .select('id,display_name')
            .eq('organization_id', s.org)
            .ilike('email', values.email.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_'))
            .limit(5),
        ] : []),
      ];
      const potential = await Promise.all(lookups);
      if (potential.some((found) => found.error))
        return { ok: false, message: 'Could not check existing customers. Please try again.' };
      const duplicate = potential.flatMap((found) => found.data ?? [])[0];
      if (duplicate)
        return {
          ok: false,
          message: 'Customer already exists: ' + duplicate.display_name +
            '. Choose that customer under Existing customer to keep the same CRN.',
        };

      customerId = randomUUID();
      await s.commercial.saveEntity(s.org, 'customers', {
        id: customerId,
        organization_id: s.org,
        version: 1,
        customer_type: 'individual',
        display_name: values.clientName,
        legal_name: '',
        phone: values.phone,
        secondary_phone: '',
        email: values.email,
        tax_identifier: '',
        billing_address: baseAddress,
        notes: '',
        status: 'active',
      });
    }

    let projectId = values.projectId ?? '';
    if (projectId) {
      const { data: selectedProject, error } = await s.client
        .from('projects')
        .select('id')
        .eq('organization_id', s.org)
        .eq('customer_id', customerId)
        .eq('id', projectId)
        .eq('status', 'active')
        .maybeSingle();
      if (error || !selectedProject)
        return { ok: false, message: 'This project does not belong to the selected customer.' };
    } else {
      const { data: projectMatches, error } = await s.client
        .from('projects')
        .select('id')
        .eq('organization_id', s.org)
        .eq('customer_id', customerId)
        .eq('name', values.projectName)
        .eq('status', 'active')
        .limit(2);
      if (error)
        return { ok: false, message: 'Could not check existing projects. Please try again.' };
      if (projectMatches?.length === 1) {
        projectId = projectMatches[0].id;
      } else if (projectMatches?.length) {
        return { ok: false, message: 'Multiple projects share this name. Select the intended existing project.' };
      } else {
        projectId = randomUUID();
        const projectCode =
          'Q' +
          Date.now().toString(36).toUpperCase() +
          randomUUID().slice(0, 5).toUpperCase();
        await s.commercial.saveEntity(s.org, 'projects', {
          id: projectId,
          organization_id: s.org,
          version: 1,
          customer_id: customerId,
          name: values.projectName,
          code: projectCode.slice(0, 64),
          industry_id: activeIndustry.id,
          branch_id: null,
          project_type: values.projectType,
          site_address: baseAddress,
          status: 'active',
          notes: values.plotSize ? 'Plot / project size: ' + values.plotSize : '',
          assigned_user_id: null,
        });
      }
    }

    // A project's existing quotation is the canonical quotation; its drafts
    // and issued amendments are revisions, not independent client records.
    const { data: existingQuotes, error: quotesError } = await s.client
      .from('quotations')
      .select('current_revision_id,status')
      .eq('organization_id', s.org)
      .eq('project_id', projectId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (quotesError)
      return { ok: false, message: 'Could not check previous quotations. Try again.' };
    if (existingQuotes?.[0]?.current_revision_id) {
      return {
        ok: true,
        message: 'Opening the existing project quotation and its revisions.',
        revisionId: existingQuotes[0].current_revision_id,
      };
    }

    const revisionId = await s.commercial.commit(
      s.org,
      quotationCommandSchema.parse({
        action: 'create',
        project_id: projectId,
        currency: values.currency,
      }),
    );
    revalidatePath('/dashboard/quotations');
    return {
      ok: true,
      message: 'Branded quotation draft created.',
      revisionId,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        safeFailure(error).message ||
        'Could not create a quotation. Check your company permissions.',
    };
  }
}
