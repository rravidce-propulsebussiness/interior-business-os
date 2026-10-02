import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { interiorWebsite } from '../../packages/industry-interior/src/website';
import { compileWebsite } from '../../packages/website-builder/src/compiler';
import { websiteHtml } from '../../packages/website-builder/src/render';
import { createNode } from '../../packages/website-builder/src/model';

test.describe('Published website renderer fixtures', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'websites', 'Public renderer application');
  });
  const fixtureDocument = () =>
    interiorWebsite('00000000-0000-4000-8000-000000000008');
  test('interior starter renders eight editable pages at desktop and mobile widths', async ({
    page,
  }) => {
    await page.goto('/');
    await page.route('**/assets/*', (route) =>
      route.fulfill({
        contentType: 'image/webp',
        body: readFileSync(
          'packages/industry-interior/assets/living-room-concept.webp',
        ),
      }),
    );
    const build = compileWebsite(fixtureDocument());
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const entry of build.document.pages) {
        await page.setContent(websiteHtml(build, entry.path)!);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('main')).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.setContent(websiteHtml(build, '/')!);
      await page
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.decode());
      await page.screenshot({
        path: `test-results/website-interior-${width}.png`,
        fullPage: true,
      });
    }
  });
  test('preview is noindex, sends selection and disables lead submission', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setContent(
      websiteHtml(compileWebsite(fixtureDocument()), '/contact', {
        preview: true,
      })!,
    );
    await expect(page.locator('meta[name=robots]')).toHaveAttribute(
      'content',
      'noindex,nofollow',
    );
    await expect(
      page.getByRole('button', { name: 'Send enquiry' }),
    ).toBeDisabled();
    await expect(page.locator('[data-website-node]')).not.toHaveCount(0);
    const node = page.locator('[data-website-node]').first();
    const nodeId = await node.getAttribute('data-website-node');
    const selection = page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const receive = (event: MessageEvent) => {
            if (event.data?.type === 'website.select') {
              window.removeEventListener('message', receive);
              resolve(event.data.id);
            }
          };
          window.addEventListener('message', receive);
          document.querySelector<HTMLElement>('[data-website-node]')!.click();
        }),
    );
    expect(await selection).toBe(nodeId);
  });
  test('custom JavaScript runs in an opaque frame without parent DOM or storage', async ({
    page,
  }) => {
    const doc = fixtureDocument();
    doc.code = [
      {
        id: 'safeCode',
        name: 'Public data example',
        html: '<p id="result">Loading</p>',
        css: 'p{color:#343F36}',
        javascript:
          'document.getElementById("result").textContent = website.getBusinessProfile().name;',
      },
    ];
    const custom = createNode('custom', 'customBlock');
    custom.props = { code: 'safeCode' };
    doc.pages[0]!.nodes.push(custom);
    await page.goto('/');
    await page.setContent(websiteHtml(compileWebsite(doc), '/')!);
    const frame = page.frameLocator('iframe.website-custom');
    await expect(frame.locator('#result')).toHaveText(doc.settings.name);
    const child = page.frames().find((f) => f !== page.mainFrame())!;
    expect(
      await child.evaluate(() => {
        try {
          void parent.document;
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await child.evaluate(() => {
        try {
          localStorage.setItem('probe', '1');
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await expect(page.locator('iframe.website-custom')).toHaveAttribute(
      'sandbox',
      'allow-scripts',
    );
  });
});
