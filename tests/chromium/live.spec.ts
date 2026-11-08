import { test, expect } from '@playwright/test';

const origin = 'https://sghomesinterior.in';

test('live WhatsApp Calling API route is served by Next.js', async ({ request }) => {
  // The removed Hostinger diagnostic page returns 404 on a healthy deployment.
  // The real calling route provides an unauthenticated validation response
  // without looking up tokens or attempting to place a call.
  const response = await request.get(
    origin + '/api/whatsapp/calling?connectionId=not-a-uuid',
    { timeout: 20000 },
  );
  console.log('LIVE_CALLING_ROUTE_STATUS=' + response.status());
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ message: 'Select a WhatsApp number.' });
});

test('public homepage and login both render without 503', async ({ page }) => {
  for (const path of ['/', '/login']) {
    const response = await page.goto(origin + path, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    console.log('LIVE_PAGE_STATUS ' + path + '=' + (response?.status() ?? 'NO_RESPONSE'));
    expect(response?.status(), 'Expected working page: ' + path).toBe(200);
  }
});

test('production health endpoint responds', async ({ request }) => {
  const response = await request.get(origin + '/api/health', { timeout: 20000 });
  console.log('LIVE_HEALTH_STATUS=' + response.status());
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'alive' });
});
