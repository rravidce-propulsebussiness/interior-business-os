import { performance } from 'node:perf_hooks';
import { request, assert, AcceptanceError } from './http.mjs';
import { runCheck } from './checks.mjs';
import { chromium, expect } from '@playwright/test';

export function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
export function validatePerformance(plan) {
  if (!Array.isArray(plan) || plan.length > 9)
    throw new Error('INVALID_PERFORMANCE_PLAN');
  for (const p of plan) {
    if (
      ![
        'api',
        'dashboard',
        'crm',
        'quotation',
        'project',
        'reports',
        'pdf',
        'website',
        'brochure',
      ].includes(p.id) ||
      !['BUSINESS_APP_ORIGIN', 'WEBSITES_ORIGIN'].includes(p.origin) ||
      !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(p.path) ||
      !Number.isInteger(p.samples) ||
      p.samples < 20 ||
      p.samples > 100 ||
      p.expectedStatus !== 200 ||
      (['dashboard', 'crm', 'quotation', 'project', 'reports'].includes(p.id) &&
        !p.path.startsWith('/dashboard'))
    )
      throw new Error('INVALID_PERFORMANCE_PLAN');
  }
}
export async function measure(env, report, target) {
  if (env.ACCEPTANCE_ENVIRONMENT !== 'staging')
    throw new Error('STAGING_PERFORMANCE_PLAN_REQUIRED');
  validatePerformance(target.performance);
  let browser, page;
  try {
    if (target.performance.some((p) => p.origin === 'BUSINESS_APP_ORIGIN')) {
      browser = await chromium.launch();
      page = await browser.newPage();
      await page.goto(env.BUSINESS_APP_ORIGIN + '/login');
      await page
        .getByLabel('Email', { exact: true })
        .fill(env.ACCEPTANCE_OWNER_A_EMAIL);
      await page
        .getByLabel('Password', { exact: true })
        .fill(env.ACCEPTANCE_OWNER_A_PASSWORD);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Business dashboard', exact: true }),
      ).toBeVisible();
      await page
        .getByLabel('Active organization')
        .selectOption(env.ACCEPTANCE_ORG_A_ID);
      await page
        .getByRole('button', { name: 'Switch organization', exact: true })
        .click();
    }
    for (const p of target.performance) {
      await runCheck(report, `performance.${p.id}.measured`, async () => {
        const samples = [];
        const deadline = Date.now() + 120000;
        for (let i = 0; i < p.samples; i++) {
          if (Date.now() >= deadline)
            throw new AcceptanceError(
              'PERFORMANCE_TIME_BUDGET_EXCEEDED',
              'ENVIRONMENT_LIMITATION',
              { samples: samples.length },
            );
          const start = performance.now(),
            url = new URL(p.path, env[p.origin]);
          const r =
            p.origin === 'BUSINESS_APP_ORIGIN'
              ? await page.request.get(url.href, {
                  maxRedirects: 0,
                  timeout: 30000,
                })
              : await request(url);
          const status = typeof r.status === 'function' ? r.status() : r.status;
          assert(status === p.expectedStatus, 'PERFORMANCE_RESPONSE_INVALID', {
            httpStatus: status,
          });
          samples.push(performance.now() - start);
          await new Promise((r) => setTimeout(r, 100));
        }
        return {
          samples: samples.length,
          p50Ms: percentile(samples, 0.5),
          p95Ms: percentile(samples, 0.95),
          ...(samples.length >= 100
            ? { p99Ms: percentile(samples, 0.99) }
            : {}),
        };
      });
    }
  } finally {
    if (browser) await browser.close();
  }
}
