import { expect, test } from '@playwright/test';

test('CRM pages require a business session', async ({ page }, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const path of [
    '',
    '/leads',
    '/leads/new',
    '/pipeline',
    '/followups',
    '/site-visits',
    '/settings',
    '/commercial',
  ]) {
    await page.goto('/dashboard/crm' + path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('anonymous quotation routes fail closed without leaking tenant data', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const token of ['invalid', '0'.repeat(64)]) {
    for (const suffix of ['', '/pdf']) {
      const response = await request.get('/q/' + token + suffix);
      expect(response.status()).toBe(404);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['referrer-policy']).toBe('no-referrer');
      expect(await response.text()).not.toMatch(
        /organization_id|internal_cost|snapshot|133280/,
      );
    }
    const response = await request.post('/q/' + token + '/respond', {
      headers: { Origin: 'https://untrusted.example' },
      form: { action: 'approved', name: 'Visitor', acknowledged: 'true' },
    });
    expect(response.status()).toBe(403);
  }
});
