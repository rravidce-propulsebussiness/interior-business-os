import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@business-os/shared';

const mocks = vi.hoisted(() => ({
  activeOrganization: vi.fn(),
  requirePermission: vi.fn(),
  rpc: vi.fn(),
  graphRequest: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@business-os/auth/server', () => ({
  activeOrganization: mocks.activeOrganization,
  serverServices: async () => ({
    authorization: { requirePermission: mocks.requirePermission },
    client: { rpc: mocks.rpc },
  }),
}));
vi.mock('@/lib/whatsapp-cloud', () => ({ graphRequest: mocks.graphRequest }));
vi.mock(
  '@/app/dashboard/website/upload-origin',
  async () => import('../app/dashboard/website/upload-origin'),
);
vi.mock(
  '@/lib/whatsapp-meta-error',
  async () => import('./whatsapp-meta-error'),
);

import { POST } from '../app/api/whatsapp/embedded-signup/route';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const signup = {
  organizationId: companyA,
  code: 'one-time-test-code',
  wabaId: '111111111',
  phoneNumberId: '222222222',
};
function request(body: unknown = signup, origin = 'https://business.test') {
  return new Request('https://business.test/api/whatsapp/embedded-signup', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('customer WhatsApp onboarding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('META_APP_ID', '123456789');
    vi.stubEnv('META_APP_SECRET', 'server-only-test-secret');
    vi.stubEnv('META_GRAPH_API_VERSION', 'v27.0');
    vi.stubEnv('WHATSAPP_TOKEN_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.activeOrganization.mockResolvedValue({ organizationId: companyA });
    mocks.requirePermission.mockResolvedValue({});
    mocks.fetch.mockResolvedValue(
      Response.json({ access_token: 'customer-business-test-token' }),
    );
    mocks.graphRequest
      .mockResolvedValueOnce({ id: signup.wabaId, name: 'Customer Company' })
      .mockResolvedValueOnce({ data: [{ id: signup.phoneNumberId }] })
      .mockResolvedValueOnce({ success: true });
    mocks.rpc.mockResolvedValue({ data: 'connection-id', error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('saves only to the initiating company and encrypts its own Meta token', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      companyA,
      'automation.manage',
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'whatsapp_connection_save',
      expect.objectContaining({
        p_organization_id: companyA,
        p_waba_id: signup.wabaId,
        p_phone_number_id: signup.phoneNumberId,
        p_business_name: 'Customer Company',
        p_token_ciphertext: expect.any(String),
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(
      'customer-business-test-token',
    );
    expect(await response.json()).toEqual({ connected: true });
    expect(mocks.graphRequest).toHaveBeenLastCalledWith(
      `${signup.wabaId}/subscribed_apps`,
      'customer-business-test-token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects a company switch before exchanging the one-time code', async () => {
    mocks.activeOrganization.mockResolvedValue({ organizationId: companyB });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('workspace changed'),
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.graphRequest).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects missing workspace context instead of choosing another company', async () => {
    const legacySignup = {
      code: signup.code,
      wabaId: signup.wabaId,
      phoneNumberId: signup.phoneNumberId,
    };
    expect((await POST(request(legacySignup))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('requires company management permission before contacting Meta', async () => {
    mocks.requirePermission.mockRejectedValue(new DomainError('FORBIDDEN'));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-origin signup requests', async () => {
    expect((await POST(request(signup, 'https://unrelated.test'))).status).toBe(
      403,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not save a number that is not in the authorized WhatsApp account', async () => {
    mocks.graphRequest
      .mockReset()
      .mockResolvedValueOnce({ id: signup.wabaId })
      .mockResolvedValueOnce({ data: [{ id: '333333333' }] });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.graphRequest).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not report connected when Meta has not confirmed webhooks', async () => {
    mocks.graphRequest
      .mockReset()
      .mockResolvedValueOnce({ id: signup.wabaId })
      .mockResolvedValueOnce({ data: [{ id: signup.phoneNumberId }] })
      .mockResolvedValueOnce({ success: false });
    expect((await POST(request())).status).toBe(424);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not transfer a number already connected to another company', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('another company'),
    });
  });
});
