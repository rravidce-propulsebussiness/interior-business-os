'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { quotationCommandSchema } from '@business-os/core/commercial';
import { safeFailure, DomainError } from '@business-os/shared';
import { commercialServices } from '../commercial/service';
import { contactMatches, normalizedCustomerPhone } from './customer-match';

const createInput = z
  .object({
    clientName: z.string().trim().min(2).max(200),
    customerId: z.uuid().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    leadId: z.uuid().nullable().optional(),
    phone: z.string().trim().min(3).max(40),
    email: z.union([z.literal(''), z.email().max(254)]),
    projectName: z.string().trim().min(2).max(200),
    location: z.string().trim().max(200),
    projectType: z.string().trim().min(2).max(100),
    plotSize: z.string().trim().max(40),
    notes: z.string().trim().max(1000).optional().default(''),
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

    // Quoting an enquiry is not the same as closing it Won. Keep its
    // originating lead attached while commercial work proceeds independently.
    if (values.leadId) {
      if (!s.allowed('lead.view', 'crm'))
        return { ok: false, message: 'Lead access is required to quote an enquiry.' };
      const { data: lead, error: leadError } = await s.client
        .from('leads')
        .select('id,phone,email')
        .eq('organization_id', s.org)
        .eq('id', values.leadId)
        .maybeSingle();
      if (leadError || !lead)
        return { ok: false, message: 'The selected lead is not available.' };
      const samePhone = Boolean(lead.phone && values.phone &&
        normalizedCustomerPhone(lead.phone) === normalizedCustomerPhone(values.phone));
      const sameEmail = Boolean(lead.email && values.email &&
        lead.email.toLowerCase() === values.email.toLowerCase());
      if (!samePhone && !sameEmail)
        return { ok: false, message: 'Customer contact details must match the selected lead.' };
    }

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

    let createdCustomer = false;
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
        return {
          ok: false,
          message: 'The selected customer is not available in your company.',
        };
    } else {
      const escapedName = values.clientName
        .replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      const lookups = [
        s.client
          .from('customers')
          .select('id,display_name,phone,email')
          .eq('organization_id', s.org)
          .ilike('display_name', escapedName)
          .limit(250),
        s.client
          .from('customers')
          .select('id,display_name,phone,email')
          .eq('organization_id', s.org)
          .eq('phone', values.phone)
          .limit(5),
        ...(values.email
          ? [
              s.client
                .from('customers')
                .select('id,display_name,phone,email')
                .eq('organization_id', s.org)
                .ilike(
                  'email',
                  values.email
                    .replaceAll('\\', '\\\\')
                    .replaceAll('%', '\\%')
                    .replaceAll('_', '\\_'),
                )
                .limit(5),
            ]
          : []),
      ];
      const potential = await Promise.all(lookups);
      if (potential.some((found) => found.error))
        return {
          ok: false,
          message: 'Could not check existing customers. Please try again.',
        };
      const matches = [
        ...new Map(
          potential
            .flatMap((found) => found.data ?? [])
            .filter((customer) => contactMatches(customer, values))
            .map((customer) => [customer.id, customer]),
        ).values(),
      ];
      if (matches.length)
        return {
          ok: false,
          message:
            'These contact details already belong to ' +
            matches.length +
            ' customer account(s). Choose the correct Existing customer / CRN before making another quotation.',
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
      createdCustomer = true;
    }

    let createdProject = false;
    let projectId = values.projectId ?? '';
    if (projectId) {
      const { data: selectedProject, error } = await s.client
        .from('projects')
        .select('id,industry_id')
        .eq('organization_id', s.org)
        .eq('customer_id', customerId)
        .eq('id', projectId)
        .eq('status', 'active')
        .maybeSingle();
      if (error || !selectedProject)
        return {
          ok: false,
          message: 'This project does not belong to the selected customer.',
        };
      if (
        selectedProject.industry_id &&
        selectedProject.industry_id !== activeIndustry.id
      )
        return {
          ok: false,
          message: 'Choose the correct industry for this existing project.',
        };
    } else {
      const { data: projectMatches, error } = await s.client
        .from('projects')
        .select('id')
        .eq('organization_id', s.org)
        .eq('customer_id', customerId)
        .eq('name', values.projectName)
        .eq('industry_id', activeIndustry.id)
        .eq('status', 'active')
        .limit(2);
      if (error)
        return {
          ok: false,
          message: 'Could not check existing projects. Please try again.',
        };
      if (projectMatches?.length === 1) {
        projectId = projectMatches[0]!.id;
      } else if (projectMatches?.length) {
        return {
          ok: false,
          message:
            'Multiple projects share this name. Select the intended existing project.',
        };
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
          notes: [
            values.plotSize ? 'Plot / project size: ' + values.plotSize : '',
            values.notes,
          ].filter(Boolean).join('\n'),
          assigned_user_id: null,
        });
        createdProject = true;
      }
    }

    const attachLead = async (quotationId: string) => {
      if (!values.leadId) return '';
      // The migration installs this permission-checked, tenant-scoped RPC.
      // If deployment has not run the migration yet, never pretend the
      // association was saved; the quotation itself remains accessible.
      const rpc = s.client.rpc.bind(s.client) as unknown as (
        fn: string, args: Record<string, string | boolean>,
      ) => Promise<{ error: { message: string } | null }>;
      const provisional = createdCustomer || createdProject;
      const linked = await rpc(
        provisional ? 'lead_quotation_link_provisional' : 'lead_quotation_link', {
          p_organization_id: s.org,
          p_lead_id: values.leadId,
          p_quotation_id: quotationId,
          p_project_id: projectId,
          ...(provisional ? {
            p_new_customer: createdCustomer,
            p_new_project: createdProject,
          } : {}),
        },
      );
      return linked.error
        ? ' Quotation saved, but linking it to the lead failed. Apply the lead-quotation migration and retry from the lead.'
        : '';
    };

    // Each commercial alternative is a distinct quotation under the SAME
    // customer/CRN and planning project: Standard, Premium, and later options
    // must not silently reopen a previous customer's quotation. A revision
    // remains a version of a single option and issued snapshots remain frozen.
    const revisionId = await s.commercial.commit(
      s.org,
      quotationCommandSchema.parse({
        action: 'create',
        project_id: projectId,
        currency: values.currency,
      }),
    );
    const { data: newRevision } = await s.client
      .from('quotation_revisions')
      .select('quotation_id')
      .eq('organization_id', s.org)
      .eq('id', revisionId)
      .maybeSingle();
    const linkWarning = values.leadId
      ? newRevision?.quotation_id
        ? await attachLead(newRevision.quotation_id)
        : ' Quotation created, but its lead link could not be confirmed.'
      : '';
    revalidatePath('/dashboard/quotations');
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: 'Branded quotation draft created.' + linkWarning,
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
