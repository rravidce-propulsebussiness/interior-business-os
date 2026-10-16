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
 * Saves a pre-sale customer and a signed versioned quotation draft.
 * Until the CRM conversion, the database's mandatory project FK is only an
 * internal sales-prospect reference, not a visible execution project.
 * Never use elevated credentials to bypass the actor's permissions.
 */
export async function createStudioQuotation(input: unknown): Promise<{
  ok: boolean;
  message: string;
  revisionId?: string;
}> {
  try {
    const values = createInput.parse(input);
    const s = await commercialServices('quotation.create', 'quotation');
    // A salesperson may prepare a quotation without project.create permission.
    // Projects are execution workspaces and have a separate conversion gate.
    if (!(s.allowed('customer.create', 'crm') ||
          s.allowed('customer.create', 'quotation')))
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

    // A broken signing key previously created a sales prospect even when
    // the final quotation was rejected. Verify
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

    // Fail before creating customer records if the quote-only prospect SQL
    // is not installed or the signed-in actor lacks quotation permission.
    const checkProspect = s.client.rpc.bind(s.client) as unknown as (
      name: string, args: Record<string, string>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    const prospectReady = await checkProspect('quotation_prospect_ready', {
      p_organization_id: s.org,
    });
    if (prospectReady.error || prospectReady.data !== true)
      return {
        ok: false,
        message: 'Quote-only prospect support is not ready. ' +
          'Apply the latest quotation database migration before creating a quote.',
      };

    // Reuse a contact by CRN. A quote is not yet a project; it retains the
    // chosen name, industry and site details as a sales proposal snapshot.
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

    let createdProspect = false;
    let projectId = '';
    // Only reuse a pre-sale reference for the same customer and requirement.
    // An existing signed/execution project is NEVER auto-selected here.
    const { data: projectMatches, error: matchesError } = await s.client
      .from('projects')
      .select('id')
      .eq('organization_id', s.org)
      .eq('customer_id', customerId)
      .eq('name', values.projectName)
      .eq('industry_id', activeIndustry.id)
      .eq('is_sales_prospect', true)
      .eq('status', 'active')
      .limit(2);
    if (matchesError)
      return {
        ok: false, message: 'Could not check existing quotation requirements. Try again.',
      };
    if ((projectMatches?.length ?? 0) > 1)
      return {
        ok: false, message: 'Multiple quotation requirements share this name. ' +
          'Please use a distinct requirement name.',
      };
    if (projectMatches?.length) {
      projectId = projectMatches[0]!.id;
    } else {
      // SQL inserts with is_sales_prospect=true atomically. It stays hidden
      // from Projects/Clients until conversion to a won execution project.
      const createProspect = s.client.rpc.bind(s.client) as unknown as (
        name: string,
        args: Record<string, string | boolean>,
      ) => Promise<{ data: string | null; error: { message: string } | null }>;
      const { data: prospectId, error: prospectError } =
        await createProspect('quotation_prospect_project_create', {
          p_organization_id: s.org,
          p_customer_id: customerId,
          p_industry_id: activeIndustry.id,
          p_name: values.projectName,
          p_project_type: values.projectType,
          p_site_city: values.location,
          p_notes: [
            values.plotSize ? 'Plot / project size: ' + values.plotSize : '',
            values.notes,
          ].filter(Boolean).join('\\n'),
          p_new_customer: createdCustomer,
        });
      if (prospectError || !prospectId)
        return {
          ok: false, message: 'Could not prepare the quote-only sales reference. ' +
            'Confirm the latest quotation database migration is installed.',
        };
      projectId = prospectId;
      createdProspect = true;
    }

    const attachLead = async (quotationId: string) => {
      if (!values.leadId) return '';
      // The migration installs this permission-checked, tenant-scoped RPC.
      // If deployment has not run the migration yet, never pretend the
      // association was saved; the quotation itself remains accessible.
      const rpc = s.client.rpc.bind(s.client) as unknown as (
        fn: string, args: Record<string, string | boolean>,
      ) => Promise<{ error: { message: string } | null }>;
      const provisional = createdCustomer || createdProspect;
      const linked = await rpc(
        provisional ? 'lead_quotation_link_provisional' : 'lead_quotation_link', {
          p_organization_id: s.org,
          p_lead_id: values.leadId,
          p_quotation_id: quotationId,
          p_project_id: projectId,
          ...(provisional ? {
            p_new_customer: createdCustomer,
            p_new_project: createdProspect,
          } : {}),
        },
      );
      return linked.error
        ? ' Quotation saved, but linking it to the lead failed. Apply the lead-quotation migration and retry from the lead.'
        : '';
    };

    // Each alternative is a new quotation under the same customer/CRN, using
    // a sales prospect reference internally until an actual conversion.
    // Standard and Premium must not silently reopen an existing quote. A revision
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
