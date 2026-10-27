import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(
    process.cwd(),
    'apps/business-app/src/app/dashboard/employees/employees.css',
  ),
  'utf8',
);

const markup = [
  '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>html,body{margin:0;padding:0;font-family:Arial,sans-serif;}',
  css,
  '</style></head><body>',
  '<main class="emp-workspace">',
  '<header class="emp-heading"><div class="emp-heading-title"><span class="emp-title-icon">♧</span>',
  '<div><h1>Employees</h1><p>Manage staff, site teams, payroll and identity records.</p></div></div>',
  '<div class="emp-heading-actions"><button class="emp-outline">Export</button>',
  '<button class="emp-primary">Add Employee</button></div></header>',
  '<section class="emp-metrics" aria-label="Employee statistics">',
  ...[
    'Total Employees|1,500|All registered staff',
    'Active on Site|1,050|Current active site team',
    'Pending KYC|200|Missing or unverified proofs',
    'Estimated Monthly Payroll|₹98,54,32,100|Active monthly salaried staff',
  ].map((entry) => {
    const [label, value, note] = entry.split('|');
    return (
      '<article><span class="emp-metric-icon is-orange">♧</span><div>' +
      '<small>' +
      label +
      '</small><strong>' +
      value +
      '</strong><p>' +
      note +
      '</p></div></article>'
    );
  }),
  '</section>',
  '<div class="emp-layout"><section class="emp-list-area">',
  '<div class="emp-toolbar"><label class="emp-search"><input placeholder="Search employees" /></label>',
  '<select><option>All Roles</option></select><select><option>All Locations</option></select>',
  '<select><option>All Status</option></select><select><option>All Payroll Types</option></select>',
  '<button class="emp-reset">Clear</button></div>',
  '<section class="emp-table-card"><nav class="emp-tabs">',
  '<button class="active">All Employees <span>1500</span></button>',
  '<button>Site Team <span>1050</span></button>',
  '<button>Office Staff <span>250</span></button>',
  '<button>Inactive <span>200</span></button>',
  '</nav><div class="emp-table-scroll"><table class="emp-table">',
  '<thead><tr><th>ID</th><th>Employee</th><th>Role</th><th>Phone</th>',
  '<th>Location / Address</th><th>KYC</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead>',
  '<tbody><tr><td class="emp-code">EMP-001</td><td><span class="emp-person"><span class="emp-avatar">R</span>',
  '<span><b>Very Long Employee Full Name For Narrow Viewports</b><small>Site Team</small></span>',
  '</span></td><td><span class="emp-role">Site Engineer</span></td><td>9000000000</td>',
  '<td><b class="emp-location">A Very Long Road In Hyderabad</b></td>',
  '<td><span class="emp-chip kyc-verified">Verified</span></td>',
  '<td><b class="emp-salary">₹98,54,32,100</b></td>',
  '<td><span class="emp-chip is-active">Active</span></td><td>⋯</td></tr></tbody>',
  '</table></div><div class="emp-mobile-cards">',
  '<button class="emp-mobile-card selected"><span class="emp-avatar">R</span>',
  '<span class="emp-mobile-data"><b>Very Long Employee Full Name For Narrow Viewports</b>',
  '<small>EMP-001 · Site Engineer</small><small>9000000000 · Hyderabad</small>',
  '<span class="emp-mobile-tags"><span class="emp-chip kyc-verified">Verified</span>',
  '<span class="emp-chip is-active">Active</span></span></span><span>›</span></button>',
  '</div><footer class="emp-pagination"><small>Showing 1–1 of 1 employees</small>',
  '<div><span>12 per page</span><button>‹</button><strong>1</strong><span>/ 1</span><button>›</button></div></footer>',
  '</section></section>',
  '<aside class="emp-detail"><div class="emp-detail-top"><span class="emp-avatar emp-avatar-large">R</span>',
  '<div class="emp-detail-intro"><div><h2>Employee Name</h2></div>',
  '<p>EMP-001 · Site Engineer</p><small>Joined 01 Oct 2026</small></div></div>',
  '<nav class="emp-detail-tabs"><button class="active">Overview</button>',
  '<button>Documents</button><button>Payroll</button><button>Attendance</button></nav>',
  '<div class="emp-detail-body"><section class="emp-detail-section">',
  '<header><h3>Personal Information</h3><button>Edit</button></header>',
  '<div class="emp-detail-line"><span>Address</span>',
  '<b>Apartment-999, Extremely Long Address Near Construction Sites, Hyderabad</b></div>',
  '</section></div><footer class="emp-detail-footer"><button class="emp-outline">View Documents</button>',
  '<button class="emp-primary">Edit Employee</button></footer></aside></div></main></body></html>',
].join('');

test('Employees page is legible without horizontal overflow on phones, tablets and desktop', async ({
  page,
}) => {
  await page.setContent(markup);
  for (const width of [
    320, 360, 390, 430, 600, 768, 1024, 1100, 1101, 1366, 1680,
  ]) {
    await page.setViewportSize({ width, height: 840 });
    const dimensions = await page.evaluate(() => ({
      full: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(
      dimensions.full,
      'Employees page overflow at ' + width,
    ).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.locator('.emp-heading h1')).toBeVisible();
    await expect(page.locator('.emp-detail h2')).toBeVisible();
    if (width <= 1100) {
      await expect(page.locator('.emp-mobile-cards')).toBeVisible();
      await expect(page.locator('.emp-table-scroll')).toBeHidden();
    } else {
      await expect(page.locator('.emp-table-scroll')).toBeVisible();
      await expect(page.locator('.emp-mobile-cards')).toBeHidden();
    }
  }
});

test('anonymous visitors cannot access employee HR or ID-proof documents', async ({
  page,
  request,
}) => {
  const response = await page.goto('/dashboard/employees');
  expect(response).not.toBeNull();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  const file = await request.get(
    '/dashboard/employees/documents/00000000-0000-4000-8000-000000000001',
  );
  expect([401, 403, 404]).toContain(file.status());
  const body = await file.text();
  expect(body).not.toContain('storageKey');
  expect(body).not.toContain('company_employee_directory');
});
