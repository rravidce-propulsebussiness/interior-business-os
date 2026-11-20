import 'server-only';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { metaLeadConfig, metaLeadMissingConfig } from '@/lib/meta-leads';

export type MetaLeadFormView = {
  id: string;
  pageName: string;
  formId: string;
  formName: string;
  connectionId: string;
  confirmEnabled: boolean;
  templateName: string;
  templateLanguage: string;
  quoteEnabled: boolean;
  quoteMessage: string;
  countryCode: string;
  received: number;
  created: number;
  duplicate: number;
  failed: number;
  lastLeadAt: string | null;
  lastError: string | null;
};
export type MetaLeadView = {
  /** Server settings and database migration are in place. */
  configured: boolean;
  /** Names of missing server settings (shown to managers only). */
  missing: string[];
  canManage: boolean;
  canAutomate: boolean;
  webhookUrl: string;
  notice: string;
  pages: Array<{ id: string; name: string }>;
  forms: MetaLeadFormView[];
  numbers: Array<{ id: string; label: string }>;
};

const NOTICES: Record<string, string> = {
  connected: 'Facebook connected. Choose a Page and lead form below.',
  cancelled: 'Facebook login was cancelled.',
  expired:
    'Facebook login expired or its browser cookie was blocked. Allow cookies for this site and retry Connect Facebook.',
  no_pages:
    'Facebook login succeeded, but no Pages were shared. Select a Page you manage and grant its lead permissions.',
  forbidden: 'Only company owners or CRM managers can connect Facebook.',
  not_configured:
    'Meta Lead Ads is missing server configuration. Ask the administrator to check the integration settings.',
  unavailable:
    'Unable to start Facebook login. Check your Business OS session and try again; an administrator can check the server error log.',
  meta_rejected:
    'Meta rejected the login request. Check Facebook Login for Business, the Meta app ID, and the registered OAuth callback URL.',
  permission_denied:
    'Meta did not grant the requested Page or lead permissions. Review the app permissions and reconnect.',
  failed:
    'Facebook login completed, but the Pages could not be saved. Check Meta app permissions and Business OS server logs.',
};

/** Everything the Meta Lead Ads panel shows. Never includes a token. */
export async function loadMetaLeadView(input: {
  organizationId: string;
  canManage: boolean;
  canAutomate: boolean;
  notice?: string;
}): Promise<MetaLeadView> {
  const missing = metaLeadMissingConfig();
  const view: MetaLeadView = {
    configured: false,
    missing: input.canManage ? missing : [],
    canManage: input.canManage,
    canAutomate: input.canAutomate,
    webhookUrl: input.canManage ? metaLeadConfig().webhookUrl : '',
    notice: NOTICES[input.notice ?? ''] ?? '',
    pages: [],
    forms: [],
    numbers: [],
  };
  if (missing.length) return view;
  try {
    const database = createOwnerProvisioningDatabase();
    const [pages, forms, numbers] = await Promise.all([
      database
        .from('meta_lead_pages')
        .select('id,page_name')
        .eq('organization_id', input.organizationId)
        .order('page_name'),
      database
        .from('meta_lead_forms')
        .select(
          'id,page_row_id,form_id,form_name,whatsapp_connection_id,confirm_enabled,template_name,template_language,quote_enabled,quote_message,default_country_code,leads_received,leads_created,leads_duplicate,leads_failed,last_lead_at,last_error',
        )
        .eq('organization_id', input.organizationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      database
        .from('whatsapp_business_connections')
        .select('id,display_phone_number,verified_name')
        .eq('organization_id', input.organizationId)
        .eq('status', 'connected')
        .order('created_at', { ascending: false }),
    ]);
    if (pages.error || forms.error) return view;
    view.configured = true;
    view.pages = pages.data.map((page) => ({
      id: page.id,
      name: page.page_name || 'Facebook Page',
    }));
    const pageNames = new Map(view.pages.map((page) => [page.id, page.name]));
    view.forms = forms.data.map((form) => ({
      id: form.id,
      pageName: pageNames.get(form.page_row_id) ?? '',
      formId: form.form_id,
      formName: form.form_name,
      connectionId: form.whatsapp_connection_id ?? '',
      confirmEnabled: form.confirm_enabled,
      templateName: form.template_name,
      templateLanguage: form.template_language,
      quoteEnabled: form.quote_enabled,
      quoteMessage: form.quote_message,
      countryCode: form.default_country_code,
      received: form.leads_received,
      created: form.leads_created,
      duplicate: form.leads_duplicate,
      failed: form.leads_failed,
      lastLeadAt: form.last_lead_at,
      lastError: form.last_error,
    }));
    view.numbers = (numbers.data ?? []).map((number) => ({
      id: number.id,
      label:
        [number.verified_name, number.display_phone_number]
          .filter(Boolean)
          .join(' · ') || 'WhatsApp number',
    }));
  } catch {
    // Optional integration: never stop the CRM when it is not deployed.
  }
  return view;
}
