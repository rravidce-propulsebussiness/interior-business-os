import { expect, it, vi } from 'vitest';
import {
  organizationInputSchema,
  entitlementInputSchema,
  safeFailure,
  DomainError,
  signupSchema,
} from './index';
it('validates provisioning independently of authorization', () => {
  const valid = {
    name: 'A business',
    slug: 'a-business',
    currency: 'INR',
    country: 'IN',
    timezone: 'Asia/Kolkata',
  };
  expect(organizationInputSchema.safeParse(valid).success).toBe(true);
  for (const change of [
    { slug: '../escape' },
    { currency: 'rupees' },
    { country: 'India' },
    { timezone: 'made/up' },
    { name: '' },
    { is_admin: true },
  ])
    expect(
      organizationInputSchema.safeParse({ ...valid, ...change }).success,
    ).toBe(false);
});
it('rejects invalid module names and backwards entitlement windows', () => {
  expect(
    entitlementInputSchema.safeParse({
      moduleKey: 'website',
      enabled: true,
      source: 'manual',
      validFrom: '2030-01-02T00:00:00Z',
      validUntil: '2030-01-01T00:00:00Z',
    }).success,
  ).toBe(false);
  expect(
    entitlementInputSchema.safeParse({
      moduleKey: '../website',
      enabled: true,
      source: 'manual',
    }).success,
  ).toBe(false);
});
it('never reflects raw database errors or secrets into errors or logs', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = safeFailure(
    new Error('secret token and unrelated tenant name'),
  );
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  expect(result.requestId).toMatch(/^[a-f0-9-]+$/);
  expect(safeFailure(new DomainError('FORBIDDEN')).message).toBe(
    'You do not have access to this resource.',
  );
});
it('registration requires a strong minimum length and omits authorization metadata', () => {
  expect(
    signupSchema.safeParse({
      email: 'owner@example.test',
      password: 'short',
      fullName: 'Owner',
    }).success,
  ).toBe(false);
  expect(
    signupSchema.parse({
      email: 'owner@example.test',
      password: 'test-only-long-value',
      fullName: 'Owner',
      is_admin: true,
    }),
  ).not.toHaveProperty('is_admin');
});
