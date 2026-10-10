import 'server-only';

/**
 * Optional Cloudflare for SaaS provisioning adapter.
 *
 * The platform operator must first configure an active Cloudflare zone,
 * an HTTPS fallback origin and a proxied CNAME target. Tenant users never
 * receive the Cloudflare token or choose an API destination.
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
    validation_records?: ValidationRecord[];
  };
  ownership_verification?: {
    type?: string;
    name?: string;
    value?: string;
  };
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

export function cloudflareSaasEnabled() {
  return Boolean(
    process.env.CLOUDFLARE_SAAS_ZONE_ID?.trim() &&
    process.env.CLOUDFLARE_SAAS_API_TOKEN?.trim(),
  );
}

async function cloudflareRequest<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
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
  if (!response.ok)
    throw new Error('Cloudflare custom hostname API unavailable');
  const data = (await response.json()) as {
    success?: boolean;
    result?: T;
  };
  if (data.success !== true || data.result == null)
    throw new Error('Cloudflare rejected custom hostname request');
  return data.result;
}

async function findHostname(hostname: string) {
  const rows = await cloudflareRequest<CloudflareHostname[]>(
    '?hostname.exact=' + encodeURIComponent(hostname) + '&per_page=10',
  );
  if (!Array.isArray(rows))
    throw new Error('Invalid Cloudflare hostname response');
  return rows.find((row) => row.hostname === hostname) ?? null;
}

/** Idempotent across check retries; the database claim is created first. */
export async function ensureCloudflareHostname(hostname: string) {
  const existing = await findHostname(hostname);
  if (existing) return existing;
  try {
    return await cloudflareRequest<CloudflareHostname>('', 'POST', {
      hostname,
      ssl: { method: 'http', type: 'dv' },
    });
  } catch {
    // Recover safely if two requests provisioned the same claimed hostname.
    const after = await findHostname(hostname);
    if (after) return after;
    throw new Error('Cloudflare hostname provisioning unavailable');
  }
}

export async function getCloudflareHostname(hostname: string) {
  await ensureCloudflareHostname(hostname);
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
        (candidate) =>
          candidate.name === entry.name && candidate.value === entry.value,
      ) === index,
  );
}
