import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  cloudflareDnsInstructions,
  cloudflareSaasEnabled,
  ensureCloudflareHostname,
  getCloudflareHostname,
} from './cloudflare-domains';

const zoneId = '1234567890abcdef1234567890abcdef';
const hostname = 'www.customer.com';

function json(result: unknown) {
  return { ok: true, json: async () => ({ success: true, result }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Cloudflare for SaaS custom domains', () => {
  it('does not enable automatic mode without private configuration', () => {
    vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', '');
    vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', '');
    expect(cloudflareSaasEnabled()).toBe(false);
  });

  it('creates a hostname with HTTPS validation and never sends the token to the browser', async () => {
    vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', zoneId);
    vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', 'secret-test-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(
        json({
          id: 'test-id',
          hostname,
          status: 'pending',
          ssl: { status: 'pending_validation' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect((await ensureCloudflareHostname(hostname)).hostname).toBe(hostname);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1]!;
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/zones/' +
        zoneId +
        '/custom_hostnames',
    );
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer secret-test-token');
    expect(JSON.parse(options.body)).toEqual({
      hostname,
      ssl: { method: 'http', type: 'dv' },
    });
  });

  it('reuses an existing hostname rather than provisioning twice', async () => {
    vi.stubEnv('CLOUDFLARE_SAAS_ZONE_ID', zoneId);
    vi.stubEnv('CLOUDFLARE_SAAS_API_TOKEN', 'secret-test-token');
    const existing = {
      id: 'already-there',
      hostname,
      status: 'active',
      ssl: { status: 'active' },
    };
    const fetchMock = vi.fn().mockResolvedValue(json([existing]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getCloudflareHostname(hostname)).toEqual(existing);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((args) => args[1].method === 'GET')).toBe(
      true,
    );
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
