import 'server-only';

/**
 * Cloudflare for SaaS adapter.
 *
 * The platform operator configures a fallback origin and a proxied CNAME target
 * once. Customer apex and www hostnames are then registered independently.
 * API credentials are server-only and are never returned to the browser.
 */
type ValidationRecord = {
  txt_name?: string;
  txt_value?: string;
};

export type DomainDnsInstruction = {
  type: 'TXT';
  name: string;
  value: string;
};

export type CloudflareHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    method?: string;
    validation_records?: ValidationRecord[];
  };
  ownership_verification?: {
    type?: string;
    name?: string;
    value?: string;
  };
};

type FallbackOrigin = {
  origin?: string;
  status?: string;
};

function credentials() {
  const zone = process.env.CLOUDFLARE_SAAS_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_SAAS_API_TOKEN?.trim();
  if (Boolean(zone) !== Boolean(token))
    throw new Error('Cloudflare for SaaS configuration is incomplete');
  if (!zone || !token) return null;
  if (!/^[a-f0-9]{32}$/i.test(zone))
    throw new Error('Cloudflare for SaaS zone ID is invalid');
  return { zone, token };
}

function normalizedConfiguredHostname(value: string | undefined) {
  const host = value?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  if (
    !host ||
    host.length > 253 ||
    !host.includes('.') ||
    !host.split('.').every(label =>
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) return '';
  return host;
}

export function cloudflareSaasEnabled() {
  return Boolean(
    process.env.CLOUDFLARE_SAAS_ZONE_ID?.trim() &&
    process.env.CLOUDFLARE_SAAS_API_TOKEN?.trim(),
  );
}

export function cloudflareSaasFallbackOrigin() {
  return normalizedConfiguredHostname(
    process.env.CLOUDFLARE_SAAS_FALLBACK_ORIGIN,
  );
}

export function cloudflareSaasCnameTarget() {
  return normalizedConfiguredHostname(
    process.env.CLOUDFLARE_SAAS_CNAME_TARGET,
  );
}

export function cloudflareSaasConfigured() {
  return cloudflareSaasEnabled() &&
    Boolean(cloudflareSaasFallbackOrigin()) &&
    Boolean(cloudflareSaasCnameTarget());
}

async function cloudflareRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<T> {
  const config = credentials();
  if (!config) throw new Error('Cloudflare for SaaS is not configured');
  const response = await fetch(
    'https://api.cloudflare.com/client/v4/zones/' +
      config.zone +
      '/custom_hostnames' +
      path,
    {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: 'Bearer ' + config.token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: { message?: string }[];
  } | null;
  if (!response.ok || data?.success !== true || data.result == null) {
    const reason = data?.errors?.map(item => item.message).filter(Boolean).join('; ');
    throw new Error(
      reason || 'Cloudflare for SaaS API unavailable (HTTP ' + response.status + ')',
    );
  }
  return data.result;
}

/** Ensure the one-time Cloudflare for SaaS fallback origin is active. */
export async function ensureCloudflareFallbackOrigin() {
  const configuredOrigin = cloudflareSaasFallbackOrigin();
  if (!configuredOrigin)
    throw new Error('Set CLOUDFLARE_SAAS_FALLBACK_ORIGIN in the platform environment');
  if (!cloudflareSaasCnameTarget())
    throw new Error('Set CLOUDFLARE_SAAS_CNAME_TARGET in the platform environment');

  const existing = await cloudflareRequest<FallbackOrigin>('/fallback_origin');
  if (
    existing.origin === configuredOrigin &&
    existing.status === 'active'
  ) return existing;

  const updated = await cloudflareRequest<FallbackOrigin>(
    '/fallback_origin',
    'PUT',
    { origin: configuredOrigin },
  );
  if (
    updated.origin !== configuredOrigin ||
    updated.status !== 'active'
  ) throw new Error('Cloudflare fallback origin is not active yet');
  return updated;
}

async function findHostname(hostname: string) {
  const rows = await cloudflareRequest<CloudflareHostname[]>(
    '?hostname.exact=' + encodeURIComponent(hostname) + '&per_page=10',
  );
  if (!Array.isArray(rows))
    throw new Error('Invalid Cloudflare hostname response');
  return rows.find(row => row.hostname === hostname) ?? null;
}

/** Idempotent across retries; each customer hostname is provisioned once. */
export async function ensureCloudflareHostname(hostname: string) {
  await ensureCloudflareFallbackOrigin();
  const existing = await findHostname(hostname);
  if (existing) return existing;
  try {
    const created = await cloudflareRequest<CloudflareHostname>(
      '',
      'POST',
      {
        hostname,
        ssl: {
          method: 'txt',
          type: 'dv',
          settings: { min_tls_version: '1.2', http2: 'on' },
        },
      },
    );
    // Cloudflare may omit DCV tokens from the create response. Re-read the
    // hostname so the UI can display any TXT validation records immediately.
    const refreshed = await findHostname(hostname);
    return refreshed ?? created;
  } catch {
    // Recover safely if a previous attempt created the same hostname.
    const after = await findHostname(hostname);
    if (after) return after;
    throw new Error('Cloudflare could not provision this custom hostname');
  }
}

export async function getCloudflareHostname(hostname: string) {
  await ensureCloudflareFallbackOrigin();
  return (await findHostname(hostname)) ?? ensureCloudflareHostname(hostname);
}

export function cloudflareDnsInstructions(
  domain: CloudflareHostname,
): DomainDnsInstruction[] {
  const records: DomainDnsInstruction[] = [];
  if (
    domain.ownership_verification?.type === 'txt' &&
    domain.ownership_verification.name &&
    domain.ownership_verification.value
  ) {
    records.push({
      type: 'TXT',
      name: domain.ownership_verification.name,
      value: domain.ownership_verification.value,
    });
  }
  for (const record of domain.ssl?.validation_records ?? []) {
    if (record.txt_name && record.txt_value) {
      records.push({
        type: 'TXT',
        name: record.txt_name,
        value: record.txt_value,
      });
    }
  }
  return records.filter(
    (entry, index, all) =>
      all.findIndex(
        candidate =>
          candidate.name === entry.name && candidate.value === entry.value,
      ) === index,
  );
}
