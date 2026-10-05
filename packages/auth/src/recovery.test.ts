import { expect, it, vi } from 'vitest';
import { sealRecoveryToken, openRecoveryToken } from './recovery-token';
import { completeRecovery, newPasswordSchema } from './recovery-service';

const key = 'd4'.repeat(32),
  token = 'synthetic-one-time-provider-token',
  origin = 'https://business.acme.com';
it('encrypts pending tokens, binds origin/key and rejects tampering or expiration', () => {
  const envelope = sealRecoveryToken(token, key, origin, 1000);
  expect(envelope).not.toContain(token);
  expect(openRecoveryToken(envelope, key, origin, 1001)).toBe(token);
  expect(
    openRecoveryToken(envelope, key, 'https://platform.acme.com', 1001),
  ).toBeNull();
  expect(openRecoveryToken(envelope, 'e5'.repeat(32), origin, 1001)).toBeNull();
  expect(
    openRecoveryToken(envelope + 'tampered', key, origin, 1001),
  ).toBeNull();
  expect(openRecoveryToken(envelope, key, origin, 601001)).toBeNull();
  expect(() => sealRecoveryToken(token, '', origin)).toThrow(
    'AUTH_RECOVERY_SIGNING_KEY',
  );
});
it('validates passwords before consuming the one-time link', () => {
  expect(
    newPasswordSchema.safeParse({ password: 'short', confirmation: 'short' })
      .success,
  ).toBe(false);
  expect(
    newPasswordSchema.safeParse({
      password: 'matching-password',
      confirmation: 'different-password',
    }).success,
  ).toBe(false);
});
function provider() {
  return {
    verifyOtp: vi.fn().mockResolvedValue({
      data: {
        user: { id: 'recovered-user' },
        session: {
          access_token: 'fixture-access',
          user: { id: 'recovered-user' },
        },
      },
      error: null,
    }),
    updateUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'recovered-user' } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
}
it('uses only the recovery purpose and recovered identity, then revokes all refresh sessions', async () => {
  const auth = provider();
  expect(await completeRecovery(auth, token, 'replacement-password')).toBe(
    'updated',
  );
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    token_hash: token,
    type: 'recovery',
  });
  expect(auth.updateUser).toHaveBeenCalledWith({
    password: 'replacement-password',
  });
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
});
it('rejects invalid, expired or reused tokens before calling password update', async () => {
  const auth = provider();
  auth.verifyOtp.mockResolvedValue({
    data: { user: null, session: null },
    error: new Error('private token details'),
  });
  expect(await completeRecovery(auth, token, 'replacement-password')).toBe(
    'invalid',
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it('rejects a mismatched recovery principal rather than updating another user', async () => {
  const auth = provider();
  auth.verifyOtp.mockResolvedValue({
    data: {
      user: { id: 'other-user' },
      session: { access_token: 'fixture', user: { id: 'recovered-user' } },
    },
    error: null,
  });
  expect(await completeRecovery(auth, token, 'replacement-password')).toBe(
    'invalid',
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it('does not claim success when session revocation fails after the password change', async () => {
  const auth = provider();
  auth.signOut.mockResolvedValue({ error: new Error('provider detail') });
  expect(await completeRecovery(auth, token, 'replacement-password')).toBe(
    'logout_failed',
  );
});
it('revokes the newly verified session after an update failure without exposing raw errors', async () => {
  const auth = provider();
  auth.updateUser.mockRejectedValue(
    new Error('private password and provider message'),
  );
  expect(await completeRecovery(auth, token, 'replacement-password')).toBe(
    'failed',
  );
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
});
