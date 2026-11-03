import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  cloudflareDnsInstructions,
  cloudflareSaasConfigured,
  cloudflareSaasEnabled,
  ensureCloudflareHostname,
  getCloudflareHostname,
} from './cloudflare-domains';

const zoneId = '1234567890abcdef1234567890abcdef';
const hostname = 'www.customer.com';
const fallbackOrigin = 'proxy-fallback.sghomesinterior.in';

function json(result: unknown) {
  return { ok: true, json: async () => ({ success: true, result }) };
}

function configureSaas() {
  vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', zoneId);
  vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', 'secret-test-token');
  vi.stubEnv('CLOUDFLARE_SAAS_FALLBACK_ORIGIN', fallbackOrigin);
  vi.stubEnv('CLOUDFLARE_SAAS_CNAME_TARGET', 'customers.sghomesinterior.in');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Cloudflare for SaaS custom domains', () => {
  it('does not enable automatic mode without private configuration', () => {
    vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', '');
    vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', '');
    vi.stubEnv('CLOUDFLARE_SAAS_FALLBACK_ORIGIN', '');
    vi.stubEnv('CLOUDFLARE_SAAS_CNAME_TARGET', '');
    expect(cloudflareSaasEnabled()).toBe(false);
    expect(cloudflareSaasConfigured()).toBe(false);
  });

  it('requires a fallback origin and CNAME target before exposing onboarding', () => {
    vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', zoneId);
    vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', 'secret-test-token');
    vi.stubEnv('CLOUDFLARE_SAAS_FALLBACK_ORIGIN', fallbackOrigin);
    vi.stubEnv('CLOUDFLARE_SAAS_CNAME_TARGET', '');
    expect(cloudflareSaasEnabled()).toBe(true);
    expect(cloudflareSaasConfigured()).toBe(false);
  });

  it('creates a hostname after the fallback origin is active and uses TXT DCV', async () => {
    configureSaas();
    const created = {
      id: 'test-id',
      hostname,
      status: 'pending',
      ssl: { status: 'pending_validation', method: 'txt' },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ origin: fallbackOrigin, status: 'active' }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(created))
      .mockResolvedValueOnce(json([created]));
    vi.stubGlobal('fetch', fetchMock);

    expect((await ensureCloudflareHostname(hostname)).hostname).toBe(hostname);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/custom_hostnames/fallback_origin');
    const [url, options] = fetchMock.mock.calls[2]!;
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/zones/' +
        zoneId +
        '/custom_hostnames',
    );
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer secret-test-token');
    expect(JSON.parse(options.body)).toEqual({
      hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
        settings: { min_tls_version: '1.2', http2: 'on' },
      },
    });
  });

  it('reuses an existing hostname rather than provisioning twice', async () => {
    configureSaas();
    const existing = {
      id: 'already-there',
      hostname,
      status: 'active',
      ssl: { status: 'active' },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ origin: fallbackOrigin, status: 'active' }))
      .mockResolvedValueOnce(json([existing]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getCloudflareHostname(hostname)).toEqual(existing);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(args => args[1].method === 'GET')).toBe(true);
  });

  it('shows provider ownership and SSL TXT records without duplication', () => {
    expect(
      cloudflareDnsInstructions({
        id: 'host-id',
        hostname,
        status: 'pending',
        ownership_verification: {
          type: 'txt',
          name: '_cf-custom-hostname.' + hostname,
          value: 'claim',
        },
        ssl: {
          status: 'pending_validation',
          validation_records: [
            {
              txt_name: '_acme-challenge.' + hostname,
              txt_value: 'certificate',
            },
            {
              txt_name: '_acme-challenge.' + hostname,
              txt_value: 'certificate',
            },
          ],
        },
      }),
    ).toEqual([
      { type: 'TXT', name: '_cf-custom-hostname.' + hostname, value: 'claim' },
      {
        type: 'TXT',
        name: '_acme-challenge.' + hostname,
        value: 'certificate',
      },
    ]);
  });
});
