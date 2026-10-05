import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { reportHtml } from '../../packages/core/src/report-document';
import { renderPdf } from '../../packages/shared/src/pdf';

test('automation, work and report routes require authentication', async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Business application routes',
  );
  for (const path of [
    '/dashboard/automations',
    '/dashboard/notifications',
    '/dashboard/work',
    '/dashboard/reports',
    '/dashboard/reports/overview',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  const response = await request.get(
    '/dashboard/reports/snapshots/00000000-0000-4000-8000-000000000001/download?format=pdf',
  );
  expect(response.status()).toBe(403);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('actual rule builder edits structured rules and notification preferences', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Actual React components; mocked server action boundary',
  );
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RuleBuilder} from './apps/business-app/src/app/dashboard/automations/builder';import {Preferences} from './apps/business-app/src/app/dashboard/notifications/panels';createRoot(document.getElementById('root')).render(<><RuleBuilder/><Preferences initial={{}} version={0}/></>);`,
      sourcefile: 'automation-harness.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'server-action-fixture',
        setup(b) {
          b.onResolve({ filter: /^\.\/actions$/ }, () => ({
            path: 'actions',
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: `export async function saveRule(rule){window.savedRule=rule;return {message:'Rule saved.',id:'fixture',version:1}};export async function testRule(){return {message:'Preview only',preview:{matched:true}}};export async function retryJob(){return {message:'Retry queued'}};export async function markNotification(){return {message:'Updated'}};export async function savePreferences(value){window.savedPreferences=value;return {message:'Preferences saved.',version:1}}`,
            resolveDir: resolve('.'),
            loader: 'js',
          }));
        },
      },
    ],
  });
  await page.route('https://automation.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://automation.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.getByLabel('Name', { exact: true }).fill('Invoice review');
  await page
    .getByRole('combobox', { name: 'Event', exact: true })
    .selectOption('invoice.overdue');
  await page.getByRole('button', { name: 'Add action', exact: true }).click();
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Rule saved. Revision 1.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { savedRule: { actions: unknown[] } }).savedRule
          .actions.length,
    ),
  ).toBe(2);
  await page.getByLabel('Email notifications', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect(
    page.getByText('Preferences saved.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/automation-builder.png',
    fullPage: true,
  });
});

test('nine report families render printable PDFs with escaped content', async ({}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Shared PDF renderer fixture',
  );
  test.setTimeout(120000);
  await mkdir('output/pdf/phase10', { recursive: true });
  for (const kind of [
    'crm',
    'sales',
    'receivables',
    'projects',
    'procurement',
    'inventory',
    'execution',
    'snags',
    'handover',
  ]) {
    const rows = Array.from({ length: 18 }, (_, i) =>
      kind === 'inventory'
        ? {
            material: `Oak finish panel ${i + 1}`,
            unit: 'sheet',
            estimated: '100',
            received: '100',
            issued: '30',
            consumed: '20',
            returned: '5',
            scrapped: '2',
            remaining: '78',
          }
        : {
            number: `${kind.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
            title:
              i === 0
                ? 'Long project name with <unsafe markup> & a detailed operational description that must wrap cleanly across lines'
                : `Design studio project ${i + 1}`,
            status: i % 3 ? 'open' : 'completed',
            due_date: '2026-10-15',
            project_name: 'Sample workspace',
            currency: 'INR',
            value: '12500.00',
          },
    );
    const html = reportHtml(
      {
        kind,
        organization_name: 'Sample Design Studio · PDF fixture',
        generated_at: '2026-10-03T10:00:00+05:30',
        generated_by: 'Local test fixture',
        filters: { from: '2026-10-01', to: '2026-10-03' },
        basis:
          'Layout verification fixture. These sample values are not business records. Canonical calculation correctness is tested separately in PostgreSQL.',
        rows,
        summary: [{ kind, status: 'open', currency: 'INR', count: 18 }],
      },
      `fixture-${kind}`,
    );
    const bytes = await renderPdf(html);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(
      pdf.getPage(0).getHeight(),
    );
    await writeFile(`output/pdf/phase10/${kind}.pdf`, bytes);
  }
});
