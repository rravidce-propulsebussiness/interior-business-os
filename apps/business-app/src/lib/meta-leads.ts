import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import type { Json } from '@business-os/database';
import { getConnection, graphRequest } from './whatsapp-cloud';
import { MetaApiError, metaErrorMessage } from './whatsapp-meta-error';
import {
  buildQuoteMessage,
  confirmationParameters,
  mapMetaLead,
  type MetaLead,
} from './meta-lead-fields';

/**
 * Meta (Facebook/Instagram) Lead Ads → CRM.
 *
 * Owner connects Facebook Pages → links a lead form → Meta pushes every new
 * lead to /api/webhooks/meta-leads → the lead is fetched once and stored
 * through meta_lead_ingest → optionally the lead gets a WhatsApp template
 * asking them to confirm their details, and a quotation message when they do.
 */

type Database = ReturnType<typeof createOwnerProvisioningDatabase>;
const GRAPH_ORIGIN = 'https://graph.facebook.com';
const DIALOG_ORIGIN = 'https://www.facebook.com';
// pages_manage_ads is required by Meta to list a Page's lead forms.
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'business_management',
];
export const META_STATE_COOKIE = 'meta_leads_state';
const STATE_TTL_MS = 15 * 60 * 1000;
const LEAD_FIELDS =
  'id,created_time,field_data,ad_name,campaign_name,platform,form_id';

const env = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
};

function publicOrigin() {
  const raw = env('META_LEADS_PUBLIC_ORIGIN', 'APP_ORIGIN');
  try {
    const url = new URL(raw);
    if (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && process.env.NODE_ENV !== 'production')
    )
      return url.origin;
  } catch {
    // Not configured.
  }
  return '';
}

export function metaLeadConfig() {
  const version = env('META_GRAPH_API_VERSION');
  const keyHex = env(
    'META_LEADS_TOKEN_ENCRYPTION_KEY',
    'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  );
  const origin = publicOrigin();
  return {
    appId: env('META_LEADS_APP_ID', 'META_APP_ID'),
    appSecret: env('META_LEADS_APP_SECRET', 'META_APP_SECRET'),
    version: /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : '',
    verifyToken: env('META_LEADS_WEBHOOK_VERIFY_TOKEN'),
    loginConfigId: env('META_LEADS_LOGIN_CONFIG_ID'),
    key: /^[a-fA-F0-9]{64}$/.test(keyHex) ? Buffer.from(keyHex, 'hex') : null,
    origin,
    redirectUri: origin ? origin + '/api/meta-leads/oauth/callback' : '',
    webhookUrl: origin ? origin + '/api/webhooks/meta-leads' : '',
  };
}

/** Names (never values) of the server settings still missing. */
export function metaLeadMissingConfig() {
  const c = metaLeadConfig();
  const missing: string[] = [];
  if (!/^\d{5,20}$/.test(c.appId)) missing.push('META_APP_ID');
  if (c.appSecret.length < 16) missing.push('META_APP_SECRET');
  if (!c.version) missing.push('META_GRAPH_API_VERSION');
  if (c.verifyToken.length < 16)
    missing.push('META_LEADS_WEBHOOK_VERIFY_TOKEN');
  if (!c.key) missing.push('WHATSAPP_TOKEN_ENCRYPTION_KEY');
  if (!c.origin) missing.push('APP_ORIGIN');
  if (
    !process.env.SUPABASE_SECRET_KEY?.trim() &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
    missing.push('SUPABASE_SECRET_KEY');
  return missing;
}

/** A sentence a person can act on, never a raw Meta payload. */
export function whatsappErrorText(error: unknown) {
  if (error instanceof MetaApiError) return metaErrorMessage(error.code);
  if (
    error instanceof Error &&
    error.message === 'WHATSAPP_TOKEN_KEY_UNAVAILABLE'
  )
    return 'WhatsApp is not fully set up on the server.';
  return 'The WhatsApp number is not connected or the message could not be sent.';
}

export class MetaLeadError extends Error {
  constructor(
    message: string,
    readonly options: {
      status?: number;
      /** The Page access was revoked or expired; the owner must reconnect. */
      needsReconnect?: boolean;
      /** Worth retrying later (timeout or Meta-side failure). */
      transient?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'MetaLeadError';
  }
}

export function encryptPageToken(token: string) {
  const { key } = metaLeadConfig();
  if (!key) throw new MetaLeadError('Meta Lead Ads is not configured.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return {
    token_ciphertext: ciphertext.toString('base64'),
    token_iv: iv.toString('base64'),
    token_tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptPageToken(row: {
  token_ciphertext: string;
  token_iv: string;
  token_tag: string;
}) {
  const { key } = metaLeadConfig();
  if (!key) throw new MetaLeadError('Meta Lead Ads is not configured.');
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(row.token_iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(row.token_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.token_ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new MetaLeadError(
      'Reconnect Meta: the saved Page access cannot be read.',
      {
        needsReconnect: true,
      },
    );
  }
}

/**
 * Graph call for Lead Ads. Always graph.facebook.com, always with
 * appsecret_proof so a leaked Page token alone is useless, never follows
 * redirects, bounded by a timeout.
 */
export async function metaGraph<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    params?: Record<string, string | number | undefined | null>;
    token?: string;
  } = {},
): Promise<T> {
  const c = metaLeadConfig();
  if (!c.version || !c.appSecret)
    throw new MetaLeadError('Meta Lead Ads is not configured.');
  if (!/^[A-Za-z0-9_/.-]+$/.test(path))
    throw new MetaLeadError('Invalid Meta request.');
  const url = new URL(
    `${GRAPH_ORIGIN}/${c.version}/${path.replace(/^\/+/, '')}`,
  );
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.params ?? {}))
    if (value !== undefined && value !== null && value !== '')
      query.set(key, String(value));
  if (options.token) {
    query.set('access_token', options.token);
    query.set(
      'appsecret_proof',
      createHmac('sha256', c.appSecret).update(options.token).digest('hex'),
    );
  }
  const method = options.method ?? 'GET';
  const init: RequestInit = {
    method,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json' },
  };
  if (method === 'POST') {
    init.body = query;
    init.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  } else url.search = query.toString();

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new MetaLeadError('Meta did not respond in time. Please retry.', {
      transient: true,
    });
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: Record<string, unknown> }) | null;
  if (!response.ok || !body || body.error) {
    const error = body?.error ?? {};
    const code = typeof error.code === 'number' ? error.code : 0;
    const message = String(
      error.error_user_msg ||
        error.message ||
        `Meta request failed (${response.status})`,
    ).slice(0, 300);
    throw new MetaLeadError(message, {
      status: response.status,
      // 190 = invalid/expired token, 10 and 200-299 = permission problems.
      needsReconnect:
        code === 190 || code === 10 || (code >= 200 && code < 300),
      transient:
        response.status >= 500 || code === 1 || code === 2 || code === 4,
    });
  }
  return body;
}

/** Follow Graph cursor pagination up to maxItems. */
export async function metaGraphList<T>(
  path: string,
  options: {
    params?: Record<string, string | number | undefined | null>;
    token: string;
    maxItems?: number;
  },
): Promise<T[]> {
  const maxItems = options.maxItems ?? 200;
  const items: T[] = [];
  let after: string | undefined;
  do {
    const page = await metaGraph<{
      data?: T[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(path, {
      params: { ...options.params, limit: Math.min(100, maxItems), after },
      token: options.token,
    });
    items.push(...(Array.isArray(page.data) ? page.data : []));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after && items.length < maxItems);
  return items.slice(0, maxItems);
}

// ---------- Facebook Login (OAuth) ----------

const stateKey = () =>
  createHmac('sha256', metaLeadConfig().appSecret)
    .update('business-os:meta-leads:oauth-state')
    .digest();

/** Signed, short-lived state binding the Facebook login to one member and company. */
export function createOauthState(organizationId: string, userId: string) {
  const nonce = randomBytes(16).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      o: organizationId,
      u: userId,
      n: nonce,
      e: Date.now() + STATE_TTL_MS,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', stateKey())
    .update(payload)
    .digest('base64url');
  return { state: `${payload}.${signature}`, nonce };
}

export function readOauthState(state: string, cookieNonce: string) {
  const [payload, signature, extra] = state.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', stateKey()).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  try {
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {
      o?: unknown;
      u?: unknown;
      n?: unknown;
      e?: unknown;
    };
    if (
      typeof value.o !== 'string' ||
      typeof value.u !== 'string' ||
      typeof value.n !== 'string' ||
      typeof value.e !== 'number' ||
      value.e < Date.now()
    )
      return null;
    const a = Buffer.from(value.n);
    const b = Buffer.from(cookieNonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { organizationId: value.o, userId: value.u };
  } catch {
    return null;
  }
}

export function loginDialogUrl(state: string) {
  const c = metaLeadConfig();
  const url = new URL(`${DIALOG_ORIGIN}/${c.version}/dialog/oauth`);
  url.searchParams.set('client_id', c.appId);
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (c.loginConfigId) url.searchParams.set('config_id', c.loginConfigId);
  else url.searchParams.set('scope', SCOPES.join(','));
  return url.toString();
}

/** Exchange the login code and store every shared Page with its encrypted token. */
export async function savePagesFromCode(input: {
  code: string;
  organizationId: string;
  userId: string;
}) {
  const c = metaLeadConfig();
  const short = await metaGraph<{ access_token?: string }>(
    'oauth/access_token',
    {
      params: {
        client_id: c.appId,
        client_secret: c.appSecret,
        redirect_uri: c.redirectUri,
        code: input.code,
      },
    },
  );
  if (!short.access_token) throw new MetaLeadError('Meta login failed.');
  // Page tokens derived from a long-lived user token do not expire.
  const long = await metaGraph<{ access_token?: string }>(
    'oauth/access_token',
    {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: c.appId,
        client_secret: c.appSecret,
        fb_exchange_token: short.access_token,
      },
    },
  );
  const userToken = long.access_token || short.access_token;
  const pages = await metaGraphList<{
    id?: string;
    name?: string;
    access_token?: string;
  }>('me/accounts', {
    params: { fields: 'id,name,access_token' },
    token: userToken,
    maxItems: 200,
  });
  const usable = pages.filter(
    (page) => /^\d{5,32}$/.test(page.id ?? '') && page.access_token,
  );
  if (!usable.length) return 0;
  const database = createOwnerProvisioningDatabase();
  const { error } = await database.from('meta_lead_pages').upsert(
    usable.map((page) => ({
      organization_id: input.organizationId,
      page_id: page.id!,
      page_name: (page.name ?? '').slice(0, 255),
      ...encryptPageToken(page.access_token!),
      connected_by: input.userId,
      authorized_at: new Date().toISOString(),
    })),
    { onConflict: 'organization_id,page_id' },
  );
  if (error) throw new MetaLeadError('Could not save the Facebook Pages.');
  return usable.length;
}

// ---------- Importing a lead ----------

export type MetaLeadOutcome = {
  status: 'imported' | 'duplicate' | 'failed' | 'already_processed' | 'ignored';
  whatsapp?: 'sent' | 'skipped' | 'failed';
};

type FormRow = {
  id: string;
  organization_id: string;
  page_row_id: string;
  form_id: string;
  form_name: string;
  whatsapp_connection_id: string | null;
  confirm_enabled: boolean;
  template_name: string;
  template_language: string;
  template_parameters: number;
  default_country_code: string;
};
const FORM_COLUMNS =
  'id,organization_id,page_row_id,form_id,form_name,whatsapp_connection_id,confirm_enabled,template_name,template_language,template_parameters,default_country_code';

async function noteFormError(
  database: Database,
  formRowId: string,
  message: string,
) {
  await database
    .from('meta_lead_forms')
    .update({
      last_error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
    })
    .eq('id', formRowId);
}

/**
 * Import one Meta lead into the CRM. `lead` may be supplied by a catch-up
 * listing to avoid refetching. `notify` is false for catch-up imports so old
 * leads never receive an unexpected WhatsApp message.
 *
 * Throws only for failures worth a webhook retry (database or Meta outage).
 */
export async function processMetaLead(input: {
  leadgenId: string;
  formId: string;
  lead?: MetaLead;
  notify: boolean;
  database?: Database;
}): Promise<MetaLeadOutcome> {
  if (!/^\d{5,32}$/.test(input.leadgenId) || !/^\d{5,32}$/.test(input.formId))
    return { status: 'ignored' };
  const database = input.database ?? createOwnerProvisioningDatabase();
  const found = await database
    .from('meta_lead_forms')
    .select(FORM_COLUMNS)
    .eq('form_id', input.formId)
    .eq('status', 'active')
    .maybeSingle();
  if (found.error) throw new Error('META_LEAD_FORM_LOOKUP_FAILED');
  const form = found.data as FormRow | null;
  if (!form) return { status: 'ignored' };

  // Skip the Graph fetch entirely for a lead that is already in the CRM.
  const prior = await database
    .from('meta_lead_events')
    .select('status')
    .eq('leadgen_id', input.leadgenId)
    .maybeSingle();
  if (prior.error) throw new Error('META_LEAD_EVENT_LOOKUP_FAILED');
  if (prior.data && !['received', 'failed'].includes(prior.data.status))
    return { status: 'already_processed' };

  let lead = input.lead;
  if (!lead) {
    const page = await database
      .from('meta_lead_pages')
      .select('token_ciphertext,token_iv,token_tag')
      .eq('organization_id', form.organization_id)
      .eq('id', form.page_row_id)
      .maybeSingle();
    if (page.error) throw new Error('META_LEAD_PAGE_LOOKUP_FAILED');
    if (!page.data) return { status: 'ignored' };
    try {
      lead = await metaGraph<MetaLead>(input.leadgenId, {
        params: { fields: LEAD_FIELDS },
        token: decryptPageToken(page.data),
      });
    } catch (error) {
      const failure =
        error instanceof MetaLeadError
          ? error
          : new MetaLeadError('Meta request failed.');
      if (failure.options.transient) throw failure;
      await noteFormError(
        database,
        form.id,
        failure.options.needsReconnect
          ? 'Reconnect Meta: access to this Page was revoked or expired.'
          : failure.message,
      );
      return { status: 'failed' };
    }
  }

  const mapped = mapMetaLead(lead, {
    defaultCountryCode: form.default_country_code,
  });
  const { details, ...fields } = mapped;
  const ingested = await database.rpc('meta_lead_ingest', {
    p_organization_id: form.organization_id,
    p_form_row_id: form.id,
    p_leadgen_id: input.leadgenId,
    p_input: fields as Json,
  });
  if (ingested.error) throw new Error('META_LEAD_INGEST_FAILED');
  const result = ingested.data as {
    status: MetaLeadOutcome['status'];
    lead_name?: string;
    company_name?: string;
  };
  if (result.status !== 'imported' || !input.notify || !form.confirm_enabled)
    return { status: result.status };

  const whatsapp = await sendConfirmation(database, form, input.leadgenId, {
    waId: mapped.wa_id,
    name: mapped.name,
    details,
    companyName: result.company_name ?? '',
  });
  return { status: 'imported', whatsapp };
}

async function sendConfirmation(
  database: Database,
  form: FormRow,
  leadgenId: string,
  lead: {
    waId: string;
    name: string;
    details: Array<{ label: string; value: string }>;
    companyName: string;
  },
): Promise<'sent' | 'skipped' | 'failed'> {
  const log = (sent: boolean, error?: string) =>
    database.rpc('meta_lead_confirmation_logged', {
      p_organization_id: form.organization_id,
      p_leadgen_id: leadgenId,
      p_connection_id: form.whatsapp_connection_id!,
      p_sent: sent,
      ...(error ? { p_error: error } : {}),
    });
  if (!form.whatsapp_connection_id) return 'skipped';
  try {
    if (!lead.waId) {
      await log(
        false,
        'The phone number on the form is not a WhatsApp-ready number',
      );
      return 'failed';
    }
    // Never message someone who has opted out of this number.
    const contact = await database
      .from('whatsapp_contacts')
      .select('opted_out_at')
      .eq('organization_id', form.organization_id)
      .eq('connection_id', form.whatsapp_connection_id)
      .eq('wa_id', lead.waId)
      .maybeSingle();
    if (contact.data?.opted_out_at) {
      await log(false, 'This contact has opted out of WhatsApp messages');
      return 'skipped';
    }
    const connection = await getConnection(
      form.organization_id,
      form.whatsapp_connection_id,
    );
    const parameters = confirmationParameters(lead, form.template_parameters);
    const sent = await graphRequest<{ messages?: Array<{ id?: string }> }>(
      `${connection.phone_number_id}/messages`,
      connection.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: lead.waId,
          type: 'template',
          template: {
            name: form.template_name,
            language: { code: form.template_language },
            ...(parameters.length
              ? {
                  components: [
                    {
                      type: 'body',
                      parameters: parameters.map((text) => ({
                        type: 'text',
                        text,
                      })),
                    },
                  ],
                }
              : {}),
          },
        }),
      },
    );
    const providerId = sent.messages?.[0]?.id ?? '';
    if (!providerId) throw new Error('META_MESSAGE_ID_MISSING');
    await database.rpc('whatsapp_message_log_outbound', {
      p_organization_id: form.organization_id,
      p_connection_id: form.whatsapp_connection_id,
      p_to: lead.waId,
      p_provider_id: providerId,
      p_body: `Template · ${form.template_name}`,
      p_type: 'template',
    });
    await log(true);
    return 'sent';
  } catch (error) {
    await log(false, whatsappErrorText(error));
    return 'failed';
  }
}

/**
 * Called for each inbound WhatsApp message. When the sender has a pending
 * details confirmation and replies YES, the quotation message is sent.
 * Returns true when the message was fully handled here, so the ordinary
 * auto-reply rules do not also answer it.
 */
export async function handleMetaLeadReply(
  database: Database,
  connection: { id: string; organization_id: string },
  waId: string,
  text: string,
): Promise<boolean> {
  try {
    const reply = await database.rpc('meta_lead_reply', {
      p_organization_id: connection.organization_id,
      p_connection_id: connection.id,
      p_wa_id: waId,
      p_text: text.slice(0, 1000),
    });
    if (reply.error || !reply.data) return false;
    const result = reply.data as {
      action?: string;
      leadgen_id?: string;
      lead_name?: string;
      project_size?: string;
      quote_message?: string;
      company_name?: string;
      packages?: Array<{ name: string; rate_per_sqft: number }>;
    };
    if (result.action === 'confirmed') return true;
    if (result.action !== 'send_quote' || !result.leadgen_id) return false;

    const body = buildQuoteMessage({
      template: result.quote_message ?? '',
      name: result.lead_name ?? '',
      companyName: result.company_name ?? '',
      projectSize: result.project_size ?? '',
      packages: (result.packages ?? []).map((item) => ({
        name: String(item.name),
        rate_per_sqft: Number(item.rate_per_sqft),
      })),
    });
    try {
      const connected = await getConnection(
        connection.organization_id,
        connection.id,
      );
      // The lead has just written to us, so a normal text is allowed.
      const sent = await graphRequest<{ messages?: Array<{ id?: string }> }>(
        `${connected.phone_number_id}/messages`,
        connected.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: waId,
            type: 'text',
            text: { preview_url: true, body },
          }),
        },
      );
      const providerId = sent.messages?.[0]?.id ?? '';
      if (!providerId) throw new Error('META_MESSAGE_ID_MISSING');
      await database.rpc('whatsapp_message_log_outbound', {
        p_organization_id: connection.organization_id,
        p_connection_id: connection.id,
        p_to: waId,
        p_provider_id: providerId,
        p_body: body,
        p_type: 'text',
      });
      await database.rpc('meta_lead_quote_logged', {
        p_organization_id: connection.organization_id,
        p_leadgen_id: result.leadgen_id,
        p_sent: true,
        p_body: body.slice(0, 1500),
      });
    } catch (error) {
      await database.rpc('meta_lead_quote_logged', {
        p_organization_id: connection.organization_id,
        p_leadgen_id: result.leadgen_id,
        p_sent: false,
        p_error: whatsappErrorText(error),
      });
    }
    return true;
  } catch {
    // Never let this optional step break ordinary WhatsApp handling.
    return false;
  }
}

/** Leads submitted in the last `days` days, oldest first. */
export async function recentFormLeads(
  token: string,
  formId: string,
  days: number,
  maxItems = 500,
) {
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const leads = await metaGraphList<MetaLead>(`${formId}/leads`, {
    params: {
      fields: LEAD_FIELDS,
      filtering: JSON.stringify([
        { field: 'time_created', operator: 'GREATER_THAN', value: since },
      ]),
    },
    token,
    maxItems,
  });
  return leads.reverse();
}
