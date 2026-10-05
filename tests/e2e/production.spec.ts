import { expect, test } from '@playwright/test';

test('health, security headers and private readiness fail safely', async ({
  request,
}, info) => {
  const alive = await request.get('/api/health');
  expect(alive.status()).toBe(200);
  expect(await alive.json()).toEqual({ status: 'alive' });
  expect(alive.headers()['cache-control']).toContain('no-store');
  const response = await request.get('/');
  expect(response.headers()['strict-transport-security']).toBe(
    'max-age=31536000',
  );
  expect(response.headers()['permissions-policy']).toContain('camera=()');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain(
    "object-src 'none'",
  );
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  const ready = await request.get('/api/ready');
  expect([200, 503]).toContain(ready.status());
  expect(await ready.json()).toEqual({
    status: ready.status() === 200 ? 'ready' : 'unavailable',
  });
  if (info.project.name !== 'websites') {
    expect(response.headers()['content-security-policy']).toContain(
      "'strict-dynamic'",
    );
    expect(response.headers()['content-security-policy']).not.toMatch(
      /script-src[^;]*unsafe-inline/,
    );
    const second = await request.get('/');
    expect(response.headers()['content-security-policy']).not.toBe(
      second.headers()['content-security-policy'],
    );
  }
});

test('admin hydration works with nonce CSP and rejects injected scripts', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'websites', 'Admin nonce policy only');
  const violations: string[] = [];
  page.on('pageerror', (error) => violations.push(error.message));
  // Inject into an HTTP document: DevTools evaluate has privileged script execution semantics.
  await page.route('**/login', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        '</head>',
        '<script>window.__phase11Injected = true</script></head>',
      ),
    });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  const value = await page.evaluate(() => {
    return (window as unknown as { __phase11Injected?: boolean })
      .__phase11Injected;
  });
  expect(value).toBeUndefined();
  expect(await page.locator('script[src]').count()).toBeGreaterThan(0);
  expect(
    await page
      .locator('script[src]')
      .evaluateAll((scripts) =>
        scripts.every((script) => Boolean((script as HTMLScriptElement).nonce)),
      ),
  ).toBe(true);
  expect(violations).toEqual([]);
});
