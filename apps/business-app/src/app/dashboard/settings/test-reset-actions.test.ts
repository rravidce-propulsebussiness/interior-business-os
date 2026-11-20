import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { name: string; args: unknown }[] = [];

// Like supabase-js, rpc() depends on `this`; an unbound call throws.
class FakeClient {
  private readonly rest = { ok: true };
  rpc(name: string, args: unknown) {
    if (!this?.rest) throw new TypeError('rpc called without its client');
    calls.push({ name, args });
    return Promise.resolve({
      data: { success: true, deleted_rows: 2 },
      error: null,
    });
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@business-os/auth/server', () => ({
  activeOrganization: async () => ({ organizationId: 'org-1' }),
  serverServices: async () => ({
    client: new FakeClient(),
    authorization: {
      requirePermission: async () => ({ roles: [{ name: 'Owner' }] }),
    },
  }),
}));

const { ownerResetTestData } = await import('./test-reset-actions');

describe('owner test data reset action', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('calls the reset RPC on its client and reports the deleted rows', async () => {
    const result = await ownerResetTestData({
      signature: 'a'.repeat(32),
      phrase: 'RESET Propulse Constructions and Interiors',
    });
    expect(calls).toEqual([
      {
        name: 'owner_test_data_reset_execute',
        args: {
          p_org: 'org-1',
          p_phrase: 'RESET Propulse Constructions and Interiors',
          p_signature: 'a'.repeat(32),
        },
      },
    ]);
    expect(result).toEqual({
      success: true,
      message:
        'Reset completed. 2 operational test records removed. Your company and settings were kept.',
    });
  });

  it('rejects a malformed confirmation without calling the database', async () => {
    const result = await ownerResetTestData({
      signature: 'not-a-signature',
      phrase: 'RESET Company',
    });
    expect(result.success).toBe(false);
    expect(calls).toEqual([]);
  });
});
