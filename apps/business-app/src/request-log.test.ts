import { describe, expect, it } from 'vitest';
import {
  requestErrorName,
  requestLogCategory,
  requestLogMethod,
} from './request-log';

describe('privacy-safe Hostinger request logging', () => {
  it.each([
    ['/', 'home'],
    ['/login', 'login'],
    ['/dashboard', 'dashboard.overview'],
    ['/dashboard/billing/new?kind=sales_invoice', 'dashboard.billing.new'],
    ['/dashboard/billing/1234', 'dashboard.billing'],
    ['/dashboard/crm/leads/1234', 'dashboard.crm.leads'],
    ['/dashboard/quotations/1234', 'dashboard.quotations'],
    ['/my-company/dashboard/projects/sensitive-id', 'dashboard.projects'],
    ['/api/billing/1234?token=secret', 'api.billing'],
    ['/api/very-private/abc', 'api.other'],
    ['/auth/callback', 'auth'],
  ])('groups %s as %s without leaking dynamic data', (path, expected) => {
    expect(requestLogCategory(path)).toBe(expected);
    expect(requestLogCategory(path)).not.toMatch(
      /1234|sensitive|secret|my-company/,
    );
  });

  it.each([
    '/_next/static/chunks/file.js',
    '/api/health',
    '/api/ready',
    '/__hostinger_diag/next',
    '/somebody/sensitive-name',
    '/images/logo.png',
  ])('skips noisy or unrelated path %s', (path) => {
    expect(requestLogCategory(path)).toBeNull();
  });

  it('allows only safe fixed methods and error names', () => {
    expect(requestLogMethod('post')).toBe('POST');
    expect(requestLogMethod('CUSTOM')).toBe('OTHER');
    expect(requestErrorName(new TypeError('access-token secret'))).toBe(
      'TypeError',
    );
    const error = new Error('private details');
    error.name = 'user@example.com';
    expect(requestErrorName(error)).toBe('UnknownError');
  });
});
