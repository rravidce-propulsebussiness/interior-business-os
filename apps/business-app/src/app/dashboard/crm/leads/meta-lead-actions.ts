'use server';

import { revalidatePath } from 'next/cache';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { z } from 'zod';
import { getConnection, graphRequest } from '@/lib/whatsapp-cloud';
import {
  MetaLeadError,
  decryptPageToken,
  metaGraph,
  metaGraphList,
  metaLeadMissingConfig,
  processMetaLead,
  recentFormLeads,
  whatsappErrorText,
} from '@/lib/meta-leads';
import { DEFAULT_CONFIRMATION_TEMPLATE } from '@/lib/meta-lead-fields';
import { templatePlaceholderCount } from '@/lib/whatsapp-template-params';
import { crmServices } from '../service';

type Result = { ok: boolean; message: string };
export type MetaFormOption = {
  formId: string;
  name: string;
  status: string;
  leadsCount: number;
};
export type MetaTemplateOption = {
  name: string;
  language: string;
  body: string;
  parameters: number;
};

const uuid = z.uuid();
const metaId = z.string().regex(/^\d{5,32}$/);

async function manager() {
  if (metaLeadMissingConfig().length)
    throw new MetaLeadError('Meta Lead Ads is not set up on the server yet.');
  const s = await crmServices('lead.view');
  if (!s.allowed('crm.source.manage') || !s.allowed('crm.pipeline.manage'))
    throw new MetaLeadError(
      'Only company owners or CRM managers can manage Meta lead forms.',
    );
  const user = await s.authorization.requireAuthenticatedUser();
  return { s, user, database: createOwnerProvisioningDatabase() };
}

function failure(error: unknown, fallback: string): Result {
  if (error instanceof MetaLeadError)
    return {
      ok: false,
      message: error.options.needsReconnect
        ? 'Facebook access to this Page was revoked or expired. Use Connect Facebook again.'
        : error.message,
    };
  return { ok: false, message: fallback };
}

async function pageWithToken(
  database: ReturnType<typeof createOwnerProvisioningDatabase>,
  organizationId: string,
  pageRowId: string,
) {
  const { data, error } = await database
    .from('meta_lead_pages')
    .select('id,page_id,page_name,token_ciphertext,token_iv,token_tag')
    .eq('organization_id', organizationId)
    .eq('id', pageRowId)
    .maybeSingle();
  if (error || !data)
    throw new MetaLeadError(
      'This Facebook Page is not connected. Use Connect Facebook first.',
    );
  return { ...data, token: decryptPageToken(data) };
}

/** Lead forms on one connected Page that are not linked to this CRM yet. */
export async function listMetaLeadForms(
  pageRowId: string,
): Promise<Result & { forms: MetaFormOption[] }> {
  try {
    const { s, database } = await manager();
    const page = await pageWithToken(database, s.org, uuid.parse(pageRowId));
    const forms = await metaGraphList<{
      id?: string;
      name?: string;
      status?: string;
      leads_count?: number;
    }>(`${page.page_id}/leadgen_forms`, {
      params: { fields: 'id,name,status,leads_count' },
      token: page.token,
      maxItems: 200,
    });
    const ids = forms.map((form) => form.id ?? '').filter(Boolean);
    const linked = ids.length
      ? await database
          .from('meta_lead_forms')
          .select('form_id')
          .eq('status', 'active')
          .in('form_id', ids)
      : { data: [], error: null };
    if (linked.error) throw new Error('lookup');
    const taken = new Set(linked.data.map((row) => row.form_id));
    return {
      ok: true,
      message: '',
      forms: forms
        .filter(
          (form) => metaId.safeParse(form.id).success && !taken.has(form.id!),
        )
        .map((form) => ({
          formId: form.id!,
          name: (form.name ?? 'Lead form').slice(0, 255),
          status: form.status ?? '',
          leadsCount: Number(form.leads_count) || 0,
        })),
    };
  } catch (error) {
    return { ...failure(error, 'Could not load lead forms.'), forms: [] };
  }
}

/** Link a lead form: Meta then pushes each new lead to this CRM. */
export async function connectMetaLeadForm(
  pageRowId: string,
  formId: string,
): Promise<Result> {
  try {
    const { s, user, database } = await manager();
    const page = await pageWithToken(database, s.org, uuid.parse(pageRowId));
    const form = await metaGraph<{
      id?: string;
      name?: string;
      page?: { id?: string };
    }>(metaId.parse(formId), {
      params: { fields: 'id,name,page' },
      token: page.token,
    });
    if (form.page?.id !== page.page_id || !form.id)
      throw new MetaLeadError(
        'This lead form does not belong to the selected Page.',
      );
    // Idempotent: Meta starts pushing `leadgen` events for this Page.
    await metaGraph(`${page.page_id}/subscribed_apps`, {
      method: 'POST',
      params: { subscribed_fields: 'leadgen' },
      token: page.token,
    });
    const { error } = await database.from('meta_lead_forms').insert({
      organization_id: s.org,
      page_row_id: page.id,
      page_id: page.page_id,
      form_id: form.id,
      form_name: (form.name ?? '').slice(0, 255),
      created_by: user.id,
    });
    if (error)
      throw new MetaLeadError(
        error.code === '23505'
          ? 'This lead form is already connected to a Business OS company.'
          : 'Could not save the lead form.',
      );
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message:
        'Lead form connected. New leads will appear in All Leads automatically.',
    };
  } catch (error) {
    return failure(error, 'Could not connect the lead form.');
  }
}

async function unsubscribeIfUnused(
  database: ReturnType<typeof createOwnerProvisioningDatabase>,
  organizationId: string,
  pageRowId: string,
) {
  const page = await pageWithToken(database, organizationId, pageRowId);
  // Another company may be receiving leads from this same Page.
  const used = await database
    .from('meta_lead_forms')
    .select('id')
    .eq('page_id', page.page_id)
    .eq('status', 'active')
    .limit(1);
  if (used.error || used.data.length) return;
  await metaGraph(`${page.page_id}/subscribed_apps`, {
    method: 'DELETE',
    token: page.token,
  });
}

export async function disconnectMetaLeadForm(id: string): Promise<Result> {
  try {
    const { s, database } = await manager();
    const { data, error } = await database
      .from('meta_lead_forms')
      .update({ status: 'disabled' })
      .eq('organization_id', s.org)
      .eq('id', uuid.parse(id))
      .eq('status', 'active')
      .select('page_row_id');
    if (error || !data.length)
      throw new MetaLeadError('This lead form is not connected.');
    await unsubscribeIfUnused(database, s.org, data[0]!.page_row_id).catch(
      () => undefined,
    );
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: 'Lead form disconnected. Existing CRM leads are kept.',
    };
  } catch (error) {
    return failure(error, 'Could not disconnect the lead form.');
  }
}

/** Forget every Page and token for this company (also stops its forms). */
export async function disconnectMetaAccount(): Promise<Result> {
  try {
    const { s, database } = await manager();
    const pages = await database
      .from('meta_lead_pages')
      .select('id')
      .eq('organization_id', s.org);
    if (pages.error) throw new Error('lookup');
    const disabled = await database
      .from('meta_lead_forms')
      .update({ status: 'disabled' })
      .eq('organization_id', s.org)
      .eq('status', 'active');
    if (disabled.error) throw new Error('disable');
    for (const page of pages.data)
      await unsubscribeIfUnused(database, s.org, page.id).catch(
        () => undefined,
      );
    // Disabled form rows and their history go with the Page (cascade).
    const removed = await database
      .from('meta_lead_pages')
      .delete()
      .eq('organization_id', s.org);
    if (removed.error) throw new Error('remove');
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: 'Facebook disconnected. Existing CRM leads are kept.',
    };
  } catch (error) {
    return failure(error, 'Could not disconnect Facebook.');
  }
}

/** Bring in leads Meta collected in the last 30 days. Sends no WhatsApp messages. */
export async function importRecentMetaLeads(id: string): Promise<Result> {
  try {
    const { s, database } = await manager();
    const { data: form, error } = await database
      .from('meta_lead_forms')
      .select('id,form_id,page_row_id')
      .eq('organization_id', s.org)
      .eq('id', uuid.parse(id))
      .eq('status', 'active')
      .maybeSingle();
    if (error || !form)
      throw new MetaLeadError('This lead form is not connected.');
    const page = await pageWithToken(database, s.org, form.page_row_id);
    const leads = await recentFormLeads(page.token, form.form_id, 30);
    let added = 0;
    let existing = 0;
    let failed = 0;
    for (const lead of leads) {
      const outcome = await processMetaLead({
        leadgenId: String(lead.id ?? ''),
        formId: form.form_id,
        lead,
        notify: false,
        database,
      });
      if (outcome.status === 'imported') added++;
      else if (outcome.status === 'failed') failed++;
      else existing++;
    }
    if (added) revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: `Checked ${leads.length} leads from the last 30 days: ${added} added, ${existing} already in CRM${failed ? `, ${failed} could not be added (no valid phone)` : ''}.`,
    };
  } catch (error) {
    return failure(error, 'Could not import recent leads.');
  }
}

type GraphTemplate = {
  name: string;
  language: string;
  status: string;
  components?: Array<{ type: string; format?: string; text?: string }>;
};

/** A template can be sent automatically only if we can fill every variable. */
function usableTemplate(template: GraphTemplate): MetaTemplateOption | null {
  if (template.status !== 'APPROVED') return null;
  const body = template.components?.find((c) => c.type === 'BODY')?.text ?? '';
  const header = template.components?.find((c) => c.type === 'HEADER');
  if (header && (header.format !== 'TEXT' || /\{\{/.test(header.text ?? '')))
    return null;
  const parameters = templatePlaceholderCount(body);
  if (!body || parameters > 3) return null;
  return {
    name: template.name,
    language: template.language,
    body,
    parameters,
  };
}

async function approvedTemplates(organizationId: string, connectionId: string) {
  const connection = await getConnection(organizationId, connectionId);
  const result = await graphRequest<{ data?: GraphTemplate[] }>(
    `${connection.waba_id}/message_templates?fields=name,language,status,components&limit=100`,
    connection.accessToken,
  );
  return {
    connection,
    all: result.data ?? [],
    usable: (result.data ?? [])
      .map(usableTemplate)
      .filter((item): item is MetaTemplateOption => item !== null),
  };
}

/** Approved templates on a WhatsApp number that suit the confirmation message. */
export async function listMetaLeadTemplates(connectionId: string): Promise<
  Result & {
    templates: MetaTemplateOption[];
    /** Status of the ready-made template, if it was already submitted. */
    starterStatus: string;
  }
> {
  try {
    const { s } = await manager();
    await s.authorization.requirePermission(s.org, 'automation.view');
    const { all, usable } = await approvedTemplates(
      s.org,
      uuid.parse(connectionId),
    );
    return {
      ok: true,
      message: '',
      templates: usable,
      starterStatus:
        all.find((t) => t.name === DEFAULT_CONFIRMATION_TEMPLATE.name)
          ?.status ?? '',
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MetaLeadError
          ? error.message
          : `Could not load WhatsApp templates: ${whatsappErrorText(error)}`,
      templates: [],
      starterStatus: '',
    };
  }
}

/** Submit the ready-made confirmation template to Meta for approval. */
export async function createMetaLeadTemplate(
  connectionId: string,
): Promise<Result> {
  try {
    const { s } = await manager();
    await s.authorization.requirePermission(s.org, 'automation.manage');
    const connection = await getConnection(s.org, uuid.parse(connectionId));
    await graphRequest(
      `${connection.waba_id}/message_templates`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: DEFAULT_CONFIRMATION_TEMPLATE.name,
          category: 'UTILITY',
          language: DEFAULT_CONFIRMATION_TEMPLATE.language,
          components: [
            {
              type: 'BODY',
              text: DEFAULT_CONFIRMATION_TEMPLATE.body,
              example: {
                body_text: [
                  [
                    'Asha',
                    'Requirement: 3 BHK interiors; City: Hyderabad',
                    'SG Homes Interior',
                  ],
                ],
              },
            },
          ],
        }),
      },
    );
    return {
      ok: true,
      message:
        'Template sent to Meta for approval. This usually takes a few minutes; then choose it here.',
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MetaLeadError
          ? error.message
          : `Could not create the template: ${whatsappErrorText(error)}`,
    };
  }
}

const followUp = z
  .object({
    id: z.uuid(),
    connectionId: z.union([z.uuid(), z.literal('')]),
    confirmEnabled: z.boolean(),
    templateName: z.string().max(512),
    templateLanguage: z.string().max(10),
    quoteEnabled: z.boolean(),
    quoteMessage: z.string().trim().max(1500),
    countryCode: z.string().regex(/^[1-9][0-9]{0,3}$/),
  })
  .strict();

/** Save what happens on WhatsApp after a lead arrives from this form. */
export async function saveMetaLeadFollowUp(input: unknown): Promise<Result> {
  try {
    const parsed = followUp.safeParse(input);
    if (!parsed.success)
      throw new MetaLeadError('Check the WhatsApp follow-up settings.');
    const value = parsed.data;
    const { s, database } = await manager();
    await s.authorization.requirePermission(s.org, 'automation.manage');
    let parameters = 0;
    if (value.confirmEnabled) {
      if (!value.connectionId)
        throw new MetaLeadError('Choose the WhatsApp number to send from.');
      const { usable } = await approvedTemplates(s.org, value.connectionId);
      const template = usable.find(
        (item) =>
          item.name === value.templateName &&
          item.language === value.templateLanguage,
      );
      if (!template)
        throw new MetaLeadError(
          'Choose a Meta-approved template with at most three variables.',
        );
      parameters = template.parameters;
    }
    const { data, error } = await database
      .from('meta_lead_forms')
      .update({
        whatsapp_connection_id: value.connectionId || null,
        confirm_enabled: value.confirmEnabled,
        template_name: value.confirmEnabled ? value.templateName : '',
        template_language: value.confirmEnabled ? value.templateLanguage : '',
        template_parameters: parameters,
        quote_enabled: value.confirmEnabled && value.quoteEnabled,
        quote_message: value.quoteMessage,
        default_country_code: value.countryCode,
      })
      .eq('organization_id', s.org)
      .eq('id', value.id)
      .eq('status', 'active')
      .select('id');
    if (error || !data.length)
      throw new MetaLeadError('Could not save the WhatsApp follow-up.');
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: value.confirmEnabled
        ? value.quoteEnabled
          ? 'Saved. New leads get the confirmation message, then the quotation when they reply YES.'
          : 'Saved. New leads get the confirmation message on WhatsApp.'
        : 'Saved. No WhatsApp message is sent for this form.',
    };
  } catch (error) {
    return error instanceof MetaLeadError
      ? failure(error, '')
      : {
          ok: false,
          message: `Could not save the WhatsApp follow-up: ${whatsappErrorText(error)}`,
        };
  }
}
