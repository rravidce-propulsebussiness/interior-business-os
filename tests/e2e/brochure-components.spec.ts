import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
async function harness(mode: 'editor' | 'viewer') {
  const result = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {emptyBrochure,createComponent,kitSchema} from './packages/brochure-builder/src/model';import {BrochureStudio} from './apps/business-app/src/app/dashboard/brochures/studio';import {BrochureViewer} from './apps/websites/src/app/brochure/[business]/[slug]/viewer';const d=emptyBrochure('Studio profile');d.pages[0].components=[{...createComponent('heading','title'),text:'Thoughtful spaces'}];d.pages.push({...d.pages[0],id:'second',name:'Services',components:[{...createComponent('heading','secondHeading'),text:'Our services'}]});d.form.enabled=true;createRoot(document.getElementById('root')).render(${mode === 'editor' ? '<BrochureStudio id="fixture" initial={d} initialVersion={1} status="draft" kit={kitSchema.parse({})} assets={[]} canEdit={true} canPublish={true}/>' : '<BrochureViewer document={d} sequence={1} businessName="Studio" formsEnabled={true} base="/brochure/studio/profile"/>'});`,
      resolveDir: process.cwd(),
      sourcefile: 'brochure-harness.tsx',
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outfile: 'brochure-harness.js',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'fixture-boundaries',
        setup(b) {
          b.onResolve({ filter: /next\/(navigation|link)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture',
          }));
          b.onResolve({ filter: /^\.\/actions$/ }, () => ({
            path: 'actions',
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents:
              args.path === 'next/navigation'
                ? 'export const useRouter=()=>({refresh(){},push(){}});'
                : args.path === 'next/link'
                  ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)};'
                  : 'export async function saveBrochure(id,version,doc){window.savedBrochure=doc;return {ok:true,version:version+1,message:"Draft saved"}};export async function publishBrochure(){return {ok:true,version:3,message:"Published fixture"}};export async function saveBrochureBlock(){return {ok:true,message:"Block saved"}};export async function brochureAssetPage(){return []};',
            loader: 'jsx',
            resolveDir: resolve('.'),
          }));
        },
      },
    ],
  });
  return {
    script: result.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
    css: result.outputFiles.find((f) => f.path.endsWith('.css'))!.text,
  };
}
test('real brochure editor supports page editing, components, undo, locking and saved draft publication', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Editor component fixture; server authorization tested separately',
  );
  const fixture = await harness('editor');
  await page.route('https://brochure.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body></body></html>',
    }),
  );
  await page.goto('https://brochure.test/');
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: fixture.css });
  await page.addScriptTag({ content: fixture.script });
  await expect(
    page.getByRole('button', { name: 'Publish saved draft', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '+ Add page', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /3\. New page/ }),
  ).toBeVisible();
  await page.getByLabel('Page name', { exact: true }).fill('About our studio');
  await page
    .getByRole('button', { name: 'heading', exact: true })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('Considered design');
  await page.getByLabel('x mm', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('x mm', { exact: true })).toHaveValue('15');
  await page.getByLabel('height mm', { exact: true }).fill('40');
  await page.getByLabel('Locked', { exact: true }).check();
  await expect(page.getByLabel('x mm', { exact: true })).toBeDisabled();
  await page.getByLabel('Locked', { exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'Publish saved draft', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await expect(
    page.getByRole('button', { name: 'Publish saved draft', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: 'test-results/brochure-editor.png',
    fullPage: true,
  });
});
test('real public brochure viewer navigates pages and sends a compact consented enquiry on mobile', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'websites',
    'Public viewer component fixture',
  );
  const fixture = await harness('viewer');
  let submitted: unknown;
  await page.route('**/brochure/studio/profile/metrics', (route) =>
    route.fulfill({ json: { accepted: true } }),
  );
  await page.route('**/brochure/studio/profile/enquiry', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: { accepted: true, message: 'Enquiry received' },
    });
  });
  await page.route('https://brochure.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body></body></html>',
    }),
  );
  await page.goto('https://brochure.test/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: fixture.css });
  await page.addScriptTag({ content: fixture.script });
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/brochure-mobile-viewer.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Request consultation', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Interested visitor');
  await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210');
  await page.getByLabel('I agree to be contacted about this enquiry.').check();
  await page.getByRole('button', { name: 'Send enquiry', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Enquiry received');
  expect(submitted).toMatchObject({
    page: 'second',
    values: { consent: true, name: 'Interested visitor' },
    honeypot: '',
  });
});
