import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const css = readFileSync(
  resolve(
    process.cwd(),
    'apps/business-app/src/app/dashboard/company/team/team-access.css',
  ),
  'utf8',
);

const markup = [
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>html,body{margin:0;padding:0;font-family:Arial,sans-serif;}',
  css,
  '</style></head><body>',
  '<main class="team-access">',
  '<header class="team-header"><div class="team-heading"><span class="team-heading-icon">T</span>',
  '<div><h1>Company Team</h1><p>Manage team access, invitations, roles and permissions.</p></div></div>',
  '<div class="team-heading-actions"><a class="team-outline">Employee records ↗</a>',
  '<button class="team-primary">Invite Member</button></div></header>',
  '<section class="team-stats">',
  ...[
    'Team Members|100|Company account memberships',
    'Active Access|89|Can access their permitted modules',
    'Pending Invites|11|Awaiting verified email acceptance',
    'Company Roles|24|Configured access roles',
  ].map((v) => {
    const [title, value, sub] = v.split('|');
    return (
      '<article class="team-stat"><span class="team-stat-icon orange">◇</span><div><span>' +
      title +
      '</span><strong>' +
      value +
      '</strong><small>' +
      sub +
      '</small></div></article>'
    );
  }),
  '</section><div class="team-body"><section class="team-directory">',
  '<nav class="team-tabs"><button class="active">Members <span>100</span></button>',
  '<button>Invitations <span>11</span></button><button>Roles &amp; Permissions <span>24</span></button></nav>',
  '<div class="team-toolbar"><label class="team-search"><input placeholder="Search team member"></label>',
  '<select><option>All Roles</option></select><select><option>All Status</option></select>',
  '<button class="team-outline">Export</button></div>',
  '<div class="team-panel"><div class="team-table-wrap"><table class="team-table">',
  '<thead><tr><th>Member</th><th>Access Roles</th><th>Scope</th><th>Status</th><th>Manage</th></tr></thead>',
  '<tbody><tr><td><span class="team-table-person"><span class="team-avatar">RK</span><span>',
  '<b>A very long membership display name from a company</b><small>123e4567…</small></span></span></td>',
  '<td><span class="team-role-pill">Project manager and organization reviewer</span></td>',
  '<td>Company-wide</td><td><span class="team-state team-state-active">Active</span></td>',
  '<td><button class="team-more">···</button></td></tr></tbody></table></div>',
  '<div class="team-mobile-members"><button class="team-mobile-member selected">',
  '<span class="team-avatar">RK</span><span class="team-mobile-member-data">',
  '<b>A very long membership display name from a company</b>',
  '<small>Project manager and organization reviewer</small>',
  '<small>Company-wide</small></span><span class="team-state team-state-active">Active</span>',
  '<span class="team-chevron">›</span></button></div>',
  '<footer class="team-pagination"><span>Showing 1–8 of 100</span><div><button>‹</button>',
  '<strong>1</strong><button>›</button></div></footer></div></section>',
  '<aside class="team-detail team-detail-mobile-open">',
  '<div class="team-detail-header"><div class="team-detail-person"><span class="team-avatar team-avatar-large">RK</span>',
  '<div><h2>A very long membership display name</h2><p>Workspace member</p>',
  '<span class="team-state team-state-active">Active</span></div></div></div>',
  '<nav class="team-detail-tabs"><button class="active">Access</button><button>Permissions</button></nav>',
  '<div class="team-detail-body"><section class="team-detail-section"><h3>Member information</h3>',
  '<dl><div><dt>Default scope</dt><dd>Company-wide</dd></div></dl></section>',
  '<section class="team-detail-section"><h3>Assigned roles</h3>',
  '<div class="team-assigned"><span class="team-role-pill">Project manager</span>',
  '<small>Company-wide</small></div></section></div>',
  '<footer class="team-detail-footer"><a class="team-outline">Employee HR profiles</a></footer>',
  '</aside></div></main></body></html>',
].join('');

test('premium Team & Access is responsive without horizontal overflow', async ({
  page,
}) => {
  await page.setContent(markup);
  for (const width of [320, 360, 390, 430, 600, 760, 768, 1024, 1200, 1440]) {
    await page.setViewportSize({ width, height: 840 });
    const d = await page.evaluate(() => ({
      total: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(d.total, 'horizontal overflow at ' + width).toBeLessThanOrEqual(
      d.viewport + 1,
    );
    await expect(page.locator('.team-heading h1')).toBeVisible();
    await expect(page.locator('.team-tabs')).toBeVisible();
    if (width <= 760) {
      await expect(page.locator('.team-mobile-members')).toBeVisible();
      await expect(page.locator('.team-table-wrap')).toBeHidden();
    } else {
      await expect(page.locator('.team-table-wrap')).toBeVisible();
      await expect(page.locator('.team-mobile-members')).toBeHidden();
    }
  }
});

test('Team memberships require signed-in access', async ({ page }) => {
  await page.goto('/dashboard/company/team');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
