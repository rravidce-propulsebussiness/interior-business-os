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
  metaLeadConfig,
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
export type MetaPageHealth = {
  pageName: string;
  forms: number;
  webhookSubscribed: boolean;
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

/** Verify the saved Page token and the two Graph capabilities used at runtime. */
export async function checkMetaLeadPage(
  pageRowId: string,
): Promise<Result & { health: MetaPageHealth | null }> {
  try {
    const { s, database } = await manager();
    const page = await pageWithToken(database, s.org, uuid.parse(pageRowId));
    const identity = await metaGraph<{ id?: string; name?: string }>(
      page.page_id,
      {
        params: { fields: 'id,name' },
        token: page.token,
      },
    );
    if (identity.id !== page.page_id)
      throw new MetaLeadError('Meta returned a different Facebook Page.');
    const [forms, subscriptions] = await Promise.all([
      metaGraphList<{ id?: string }>(`${page.page_id}/leadgen_forms`, {
        params: { fields: 'id' },
        token: page.token,
        maxItems: 200,
      }),
      metaGraphList<{ id?: string }>(`${page.page_id}/subscribed_apps`, {
        params: { fields: 'id' },
        token: page.token,
        maxItems: 200,
      }),
    ]);
    const webhookSubscribed = subscriptions.some(
      (subscription) => subscription.id === metaLeadConfig().appId,
    );
    return {
      ok: true,
      message: webhookSubscribed
        ? 'Page access, lead forms and the leadgen webhook are ready.'
        : 'Page access works, but the leadgen webhook is not active yet. Connect a lead form below.',
      health: {
        pageName: (identity.name || page.page_name || 'Facebook Page').slice(
          0,
          255,
        ),
        forms: forms.length,
        webhookSubscribed,
      },
    };
  } catch (error) {
    return {
      ...failure(error, 'Could not verify this Facebook Page.'),
      health: null,
    };
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
    let leads: Awaited<ReturnType<typeof recentFormLeads>> = [];
    let failedLeadIds: string[] = [];
    try {
      leads = await recentFormLeads(page.token, form.form_id, 30);
    } catch {
      // Some Meta forms reject the bulk /{form-id}/leads listing even though
      // their individual lead IDs remain readable. Retry webhook failures one
      // by one so the owner can still recover them from this button.
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const pending = await database
        .from('meta_lead_events')
        .select('leadgen_id')
        .eq('organization_id', s.org)
        .eq('form_row_id', form.id)
        .eq('status', 'failed')
        .gte('created_at', cutoff)
        .order('created_at');
      if (pending.error) throw new Error('META_LEAD_RECOVERY_LOOKUP_FAILED');
      failedLeadIds = (pending.data ?? []).map((row) => row.leadgen_id);
      if (!failedLeadIds.length)
        throw new MetaLeadError('Meta did not return recent leads.');
    }
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
    for (const leadgenId of failedLeadIds) {
      const outcome = await processMetaLead({
        leadgenId,
        formId: form.form_id,
        notify: false,
        database,
      });
      if (outcome.status === 'imported') added++;
      else if (outcome.status === 'failed') failed++;
      else existing++;
    }
    if (added) revalidatePath('/dashboard/crm/leads');
    const checked = leads.length + failedLeadIds.length;
    return {
      ok: true,
      message: `Checked ${checked} leads from the last 30 days: ${added} added, ${existing} already in CRM${failed ? `, ${failed} could not be added` : ''}.`,
    };
  } catch (error) {
    return failure(error, 'Could not import recent leads.');
  }
}

type GraphTemplate = {
  name: string;
  language: string;
  status: string;
  components?: Array<{
    type: string;
    format?: string;
    text?: string;
    cards?: Array<{
      components?: Array<{
        type: string;
        format?: string;
        text?: string;
        buttons?: Array<{ type?: string; url?: string }>;
      }>;
    }>;
    buttons?: Array<{ type?: string; url?: string }>;
  }>;
};

export type LeadBrochureTemplateOption = {
  name: string;
  language: string;
  body: string;
  kind: 'service' | 'carousel';
  cardCount: number;
  brochureUrls: string[];
  imageCards: boolean;
};

function leadBrochureTemplate(
  template: GraphTemplate,
): LeadBrochureTemplateOption | null {
  if (template.status !== 'APPROVED') return null;
  const components = template.components ?? [];
  const carousel = components.find((c) => c.type.toUpperCase() === 'CAROUSEL');
  if (carousel) {
    const cards = carousel.cards ?? [];
    if (cards.length !== 2) return null;
    const body =
      components.find((c) => c.type.toUpperCase() === 'BODY')?.text ?? '';
    const cardUrls = cards.flatMap((card) =>
      (card.components ?? []).flatMap((component) =>
        (component.buttons ?? [])
          .filter((button) => button.type?.toUpperCase() === 'URL')
          .map((button) => button.url ?? ''),
      ),
    );
    const imageCards = cards.every((card) =>
      card.components?.some(
        (component) =>
          component.type.toUpperCase() === 'HEADER' &&
          component.format?.toUpperCase() === 'IMAGE',
      ),
    );
    if (
      components.some((c) => /\{\{/.test(c.text ?? '')) ||
      cardUrls.length !== 2 ||
      cardUrls.some((url) => !/^https:\/\//i.test(url) || /\{\{/.test(url)) ||
      !imageCards
    )
      return null;
    return {
      name: template.name,
      language: template.language,
      body,
      kind: 'carousel',
      cardCount: cards.length,
      brochureUrls: cardUrls,
      imageCards,
    };
  }
  const body =
    components.find((c) => c.type.toUpperCase() === 'BODY')?.text ?? '';
  const header = components.find((c) => c.type.toUpperCase() === 'HEADER');
  if (
    header &&
    (header.format?.toUpperCase() !== 'TEXT' || /\{\{/.test(header.text ?? ''))
  )
    return null;
  if (!body || templatePlaceholderCount(body) !== 3) return null;
  return {
    name: template.name,
    language: template.language,
    body,
    kind: 'service',
    cardCount: 0,
    brochureUrls: [],
    imageCards: false,
  };
}

export type LeadBrochureAutomationData = {
  forms: Array<{
    id: string;
    formName: string;
    formId: string;
    pageName: string;
    enabled: boolean;
    connectionId: string;
    serviceTemplateName: string;
    serviceTemplateLanguage: string;
    carouselTemplateName: string;
    carouselTemplateLanguage: string;
    constructionUrl: string;
    interiorsUrl: string;
    constructionImageUrl: string;
    interiorsImageUrl: string;
  }>;
  connections: Array<{ id: string; name: string; phone: string }>;
  templates: Record<string, LeadBrochureTemplateOption[]>;
};

/** Lists linked Meta forms and approved WhatsApp templates without exposing credentials. */
export async function loadLeadBrochureAutomationData(): Promise<
  Result & { data: LeadBrochureAutomationData }
> {
  const empty: LeadBrochureAutomationData = {
    forms: [],
    connections: [],
    templates: {},
  };
  try {
    const { s, database } = await manager();
    await s.authorization.requirePermission(s.org, 'automation.view');
    const [formsResult, connectionResult] = await Promise.all([
      database
        .from('meta_lead_forms')
        .select(
          'id,form_id,form_name,status,brochure_automation_enabled,brochure_automation_connection_id,brochure_service_template_name,brochure_service_template_language,brochure_carousel_template_name,brochure_carousel_template_language,construction_brochure_url,interiors_brochure_url,construction_brochure_image_url,interiors_brochure_image_url,page_row_id',
        )
        .eq('organization_id', s.org)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      database
        .from('whatsapp_business_connections')
        .select('id,business_name,verified_name,display_phone_number,status')
        .eq('organization_id', s.org)
        .eq('status', 'connected'),
    ]);
    if (formsResult.error || connectionResult.error) throw new Error('lookup');
    const pageIds = [
      ...new Set((formsResult.data ?? []).map((row) => row.page_row_id)),
    ];
    const pagesResult = pageIds.length
      ? await database
          .from('meta_lead_pages')
          .select('id,page_name')
          .eq('organization_id', s.org)
          .in('id', pageIds)
      : { data: [], error: null };
    if (pagesResult.error) throw new Error('lookup');
    const pages = new Map(
      (pagesResult.data ?? []).map((page) => [page.id, page.page_name]),
    );
    const connections = (connectionResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.verified_name || item.business_name || 'WhatsApp business',
      phone: item.display_phone_number || '',
    }));
    const templates: LeadBrochureAutomationData['templates'] = {};
    await Promise.all(
      connections.map(async (connection) => {
        try {
          const { all } = await approvedTemplates(s.org, connection.id);
          templates[connection.id] = all
            .map(leadBrochureTemplate)
            .filter(
              (item): item is LeadBrochureTemplateOption => item !== null,
            );
        } catch {
          templates[connection.id] = [];
        }
      }),
    );
    return {
      ok: true,
      message: '',
      data: {
        forms: (formsResult.data ?? []).map((row) => ({
          id: row.id,
          formName: row.form_name,
          formId: row.form_id,
          pageName: pages.get(row.page_row_id) ?? 'Facebook Page',
          enabled: row.brochure_automation_enabled,
          connectionId: row.brochure_automation_connection_id ?? '',
          serviceTemplateName: row.brochure_service_template_name,
          serviceTemplateLanguage: row.brochure_service_template_language,
          carouselTemplateName: row.brochure_carousel_template_name,
          carouselTemplateLanguage: row.brochure_carousel_template_language,
          constructionUrl: row.construction_brochure_url,
          interiorsUrl: row.interiors_brochure_url,
          constructionImageUrl: row.construction_brochure_image_url,
          interiorsImageUrl: row.interiors_brochure_image_url,
        })),
        connections,
        templates,
      },
    };
  } catch (error) {
    return {
      ...failure(error, 'Could not load lead-form automation settings.'),
      data: empty,
    };
  }
}

const brochureAutomationInput = z
  .object({
    formId: z.uuid(),
    enabled: z.boolean(),
    connectionId: z.union([z.uuid(), z.literal('')]),
    serviceTemplateName: z.string().max(512),
    serviceTemplateLanguage: z.string().max(10),
    carouselTemplateName: z.string().max(512),
    carouselTemplateLanguage: z.string().max(10),
    constructionUrl: z.string().trim().max(2048),
    interiorsUrl: z.string().trim().max(2048),
    constructionImageUrl: z.string().trim().max(2048),
    interiorsImageUrl: z.string().trim().max(2048),
  })
  .strict();

/** Save the lead-to-brochure workflow on one linked Meta form. */
export async function saveLeadBrochureAutomation(
  input: unknown,
): Promise<Result> {
  try {
    const parsed = brochureAutomationInput.safeParse(input);
    if (!parsed.success)
      throw new MetaLeadError('Check the lead-form automation settings.');
    const value = parsed.data;
    const { s, database } = await manager();
    await s.authorization.requirePermission(s.org, 'automation.manage');
    for (const url of [
      value.constructionUrl,
      value.interiorsUrl,
      value.constructionImageUrl,
      value.interiorsImageUrl,
    ]) {
      if (url) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch {
          throw new MetaLeadError('Enter valid HTTPS brochure links.');
        }
        if (parsedUrl.protocol !== 'https:')
          throw new MetaLeadError('Brochure links must use HTTPS.');
      }
    }
    if (value.enabled) {
      if (!value.connectionId)
        throw new MetaLeadError('Choose a connected WhatsApp number.');
      if (!value.constructionUrl || !value.interiorsUrl)
        throw new MetaLeadError(
          'Add both brochure links before activating this workflow.',
        );
      if (!value.constructionImageUrl || !value.interiorsImageUrl)
        throw new MetaLeadError(
          'Add a cover image link for each carousel card before activating.',
        );
      const { all } = await approvedTemplates(s.org, value.connectionId);
      const service = all
        .map(leadBrochureTemplate)
        .find(
          (template) =>
            template?.kind === 'service' &&
            template.name === value.serviceTemplateName &&
            template.language === value.serviceTemplateLanguage,
        );
      const carousel = all
        .map(leadBrochureTemplate)
        .find(
          (template) =>
            template?.kind === 'carousel' &&
            template.name === value.carouselTemplateName &&
            template.language === value.carouselTemplateLanguage &&
            [value.constructionUrl, value.interiorsUrl].every((url) =>
              template.brochureUrls.includes(url),
            ),
        );
      if (!service)
        throw new MetaLeadError(
          'Select an approved service template with exactly three body variables.',
        );
      if (!carousel)
        throw new MetaLeadError(
          'Select an approved two-card carousel template with static brochure links.',
        );
    }
    const { data, error } = await database
      .from('meta_lead_forms')
      .update({
        brochure_automation_enabled: value.enabled,
        brochure_automation_connection_id: value.connectionId || null,
        brochure_service_template_name: value.serviceTemplateName,
        brochure_service_template_language: value.serviceTemplateLanguage,
        brochure_carousel_template_name: value.carouselTemplateName,
        brochure_carousel_template_language: value.carouselTemplateLanguage,
        construction_brochure_url: value.constructionUrl,
        interiors_brochure_url: value.interiorsUrl,
        construction_brochure_image_url: value.constructionImageUrl,
        interiors_brochure_image_url: value.interiorsImageUrl,
        ...(value.enabled
          ? { confirm_enabled: false, quote_enabled: false }
          : {}),
      })
      .eq('organization_id', s.org)
      .eq('id', value.formId)
      .eq('status', 'active')
      .select('id');
    if (error || !data.length)
      throw new MetaLeadError(
        'Could not save the brochure automation for this form.',
      );
    revalidatePath('/dashboard/whatsapp');
    revalidatePath('/dashboard/crm/leads');
    return {
      ok: true,
      message: value.enabled
        ? 'Lead brochure automation is active. New Meta leads will receive the matching brochure or two-card carousel.'
        : 'Lead brochure automation is paused.',
    };
  } catch (error) {
    return failure(error, 'Could not save lead-form automation.');
  }
}

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
            {
              type: 'BUTTONS',
              buttons: DEFAULT_CONFIRMATION_TEMPLATE.buttons.map((text) => ({
                type: 'QUICK_REPLY',
                text,
              })),
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
