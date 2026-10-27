'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { quotationCommandSchema } from '@business-os/core/commercial';
import { safeFailure, DomainError } from '@business-os/shared';
import { commercialServices } from '../commercial/service';
import { contactMatches, normalizedCustomerPhone } from './customer-match';
import { resolveLeadCategory } from '../crm/leads/lead-category';

const createInput = z
  .object({
    clientName: z.string().trim().min(2).max(200),
    leadId: z.uuid(),
    phone: z.string().trim().min(3).max(40),
    email: z.union([z.literal(''), z.email().max(254)]),
    location: z.string().trim().max(200),
    projectType: z.string().trim().min(2).max(100),
    plotSize: z.string().trim().max(40),
    notes: z.string().trim().max(1000).optional().default(''),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('INR'),
  })
  .strict();

/**
 * Real quote creation from client and quotation details.
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
    if (!(
      s.allowed('customer.create', 'crm') ||
      s.allowed('customer.create', 'quotation')
    ))
      throw new DomainError('FORBIDDEN');

    // The stored CRM lead is the sole source of quotation industry.
    // Never trust a browser-supplied industry or choose construction by default.
    if (!s.allowed('lead.view', 'crm'))
      return {
        ok: false,
        message: 'Lead access is required to quote an enquiry.',
      };
    const { data: lead, error: leadError } = await s.client
      .from('leads')
      .select(
        'id,lead_number,phone,email,industry_id,service_type,requirements',
      )
      .eq('organization_id', s.org)
      .eq('id', values.leadId)
      .maybeSingle();
    if (leadError || !lead)
      return { ok: false, message: 'The selected lead is not available.' };
    const samePhone = Boolean(
      lead.phone &&
      values.phone &&
      normalizedCustomerPhone(lead.phone) ===
        normalizedCustomerPhone(values.phone),
    );
    const sameEmail = Boolean(
      lead.email &&
      values.email &&
      lead.email.toLowerCase() === values.email.toLowerCase(),
    );
    if (!samePhone && !sameEmail)
      return {
        ok: false,
        message: 'Customer contact details must match the selected lead.',
      };

    const industries = await s.repository.industries();
    const assignedIndustry = industries.find(
      (entry) => entry.id === lead.industry_id && entry.status === 'active',
    );
    // Older leads without industry_id may still have an explicit service saved.
    // Ambiguous or conflicting legacy labels must be corrected in CRM.
    const legacyCategory = !lead.industry_id
      ? resolveLeadCategory(lead, industries)
      : null;
    const activeIndustry =
      assignedIndustry ??
      industries.find(
        (entry) => entry.status === 'active' && entry.key === legacyCategory,
      );
    if (!activeIndustry)
      return {
        ok: false,
        message: 'Classify this lead in CRM before creating its quotation.',
      };

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
      name: string,
      args: Record<string, string>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    const prospectReady = await checkProspect('quotation_prospect_ready', {
      p_organization_id: s.org,
    });
    if (prospectReady.error || prospectReady.data !== true)
      return {
        ok: false,
        message:
          'Quote-only prospect support is not ready. ' +
          'Apply the latest quotation database migration before creating a quote.',
      };

    // Reuse a contact by CRN. A quote is not yet a project; it retains the
    // industry and site details as a sales proposal snapshot.
    const baseAddress = {
      line1: '',
      line2: '',
      city: values.location,
      region: '',
      postal_code: '',
      country_code: 'IN',
    };

    // A lead owns the identity of the customer being quoted. Resolve the CRN
    // automatically on the server, regardless of which browser was used.
    // Names alone cannot prove identity; confirmed phone/email must match.
    const escapedName = values.clientName
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
    const escapedEmail = values.email
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
    const phoneKey = normalizedCustomerPhone(values.phone);
    const lookups = [
      s.client
        .from('customers')
        .select('id,display_name,phone,email,created_at')
        .eq('organization_id', s.org)
        .eq('status', 'active')
        .ilike('display_name', escapedName)
        .limit(250),
      ...(phoneKey.length >= 4
        ? [
            s.client
              .from('customers')
              .select('id,display_name,phone,email,created_at')
              .eq('organization_id', s.org)
              .eq('status', 'active')
              // Broad indexed-by-suffix candidate search, then exact normalization.
              // Also matches +91 and spaced legacy mobile numbers.
              .ilike('phone', '%' + phoneKey.slice(-4))
              .limit(300),
          ]
        : []),
      ...(values.email
        ? [
            s.client
              .from('customers')
              .select('id,display_name,phone,email,created_at')
              .eq('organization_id', s.org)
              .eq('status', 'active')
              .ilike('email', escapedEmail)
              .limit(100),
          ]
        : []),
    ];
    const results = await Promise.all(lookups);
    if (results.some((result) => result.error))
      return {
        ok: false,
        message: 'Could not verify the client identity. Please retry.',
      };

    const matches = [
      ...new Map(
        results
          .flatMap((result) => result.data ?? [])
          .filter(
            (candidate) =>
              contactMatches(candidate, values) &&
              contactMatches(candidate, {
                phone: lead.phone ?? '',
                email: lead.email ?? '',
              }),
          )
          .map((candidate) => [candidate.id, candidate]),
      ).values(),
    ].sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );

    // Prefer the CRN already attached to a previous quote from this exact lead.
    // For older duplicate CRNs without a linked quote, consistently reuse the
    // oldest confirmed match. Existing historical duplicates need a separate
    // audited merge that preserves their linked quotations and projects.
    let leadCustomerId = '';
    const leadQuotationProjectIds: string[] = [];
    const linked = await s.client.rpc('lead_quotation_list', {
      p_organization_id: s.org,
      p_lead_id: values.leadId,
    });
    if (!linked.error && Array.isArray(linked.data)) {
      leadQuotationProjectIds.push(
        ...linked.data.flatMap((item: unknown) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          'project_id' in item &&
          typeof item.project_id === 'string'
            ? [item.project_id]
            : [],
        ),
      );
      const firstProjectId = leadQuotationProjectIds[0];
      if (firstProjectId) {
        const { data: previousProject } = await s.client
          .from('projects')
          .select('customer_id')
          .eq('organization_id', s.org)
          .eq('id', firstProjectId)
          .maybeSingle();
        const previousCustomer = matches.find(
          (item) => item.id === previousProject?.customer_id,
        );
        if (previousCustomer) leadCustomerId = previousCustomer.id;
      }
    }

    let createdCustomer = false;
    let customerId = leadCustomerId || matches[0]?.id || '';
    if (!customerId) {
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
    // The customer supplies no project name at quotation time. Use a stable,
    // lead-based internal reference to satisfy the existing quotation FK.
    const prospectName = [
      'Quotation',
      activeIndustry.name,
      lead.lead_number || lead.id.slice(0, 8),
    ]
      .join(' · ')
      .slice(0, 200);
    // Quote alternatives for the same lead share one hidden pre-sale reference.
    // Never pick an unrelated customer project or a confirmed execution job.
    if (leadQuotationProjectIds.length) {
      const { data: existing, error } = await s.client
        .from('projects')
        .select('id')
        .eq('organization_id', s.org)
        .eq('customer_id', customerId)
        .eq('industry_id', activeIndustry.id)
        .eq('is_sales_prospect', true)
        .eq('status', 'active')
        .in('id', [...new Set(leadQuotationProjectIds)])
        .order('created_at', { ascending: true })
        .limit(1);
      if (error)
        return {
          ok: false,
          message:
            'Could not check existing quotation requirements. Try again.',
        };
      projectId = existing?.[0]?.id ?? '';
    }
    if (!projectId) {
      // SQL inserts with is_sales_prospect=true atomically. It stays hidden
      // from Projects/Clients until conversion to a won execution project.
      const createProspect = s.client.rpc.bind(s.client) as unknown as (
        name: string,
        args: Record<string, string | boolean>,
      ) => Promise<{ data: string | null; error: { message: string } | null }>;
      const { data: prospectId, error: prospectError } = await createProspect(
        'quotation_prospect_project_create',
        {
          p_organization_id: s.org,
          p_customer_id: customerId,
          p_industry_id: activeIndustry.id,
          p_name: prospectName,
          p_project_type: values.projectType,
          p_site_city: values.location,
          p_notes: [
            values.plotSize ? 'Plot / project size: ' + values.plotSize : '',
            values.notes,
          ]
            .filter(Boolean)
            .join('\\n'),
          p_new_customer: createdCustomer,
        },
      );
      if (prospectError || !prospectId)
        return {
          ok: false,
          message:
            'Could not prepare the quote-only sales reference. ' +
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
        fn: string,
        args: Record<string, string | boolean>,
      ) => Promise<{ error: { message: string } | null }>;
      const provisional = createdCustomer || createdProspect;
      const linked = await rpc(
        provisional ? 'lead_quotation_link_provisional' : 'lead_quotation_link',
        {
          p_organization_id: s.org,
          p_lead_id: values.leadId,
          p_quotation_id: quotationId,
          p_project_id: projectId,
          ...(provisional
            ? {
                p_new_customer: createdCustomer,
                p_new_project: createdProspect,
              }
            : {}),
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
      message:
        'Quotation saved. You can edit, preview or share it.' + linkWarning,
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
