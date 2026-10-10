import { expect, test } from '@playwright/test';
const titles: Record<string, string> = {
  'platform-admin': 'Platform administration',
  'business-app': 'Run the whole business from one calm workspace.',
  websites: 'Business websites',
};
test('application shell is accessible and responsive', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    titles[testInfo.project.name]!,
  );
  await expect(page.getByRole('main')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('unknown routes return a safe 404', async ({ page }) => {
  const response = await page.goto('/missing-phase-zero-route');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
