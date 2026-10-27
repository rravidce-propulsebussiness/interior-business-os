import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const css = readFileSync(
  resolve(
    process.cwd(),
    'apps/business-app/src/app/dashboard/projects/project-v2.css',
  ),
  'utf8',
);
function shell(body: string) {
  return (
    '<!doctype html><html lang="en"><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;font-family:Arial,sans-serif}' +
    css +
    '</style></head><body>' +
    '<main class="pv2-page">' +
    body +
    '</main></body></html>'
  );
}
const directory = shell(
  '<header class="pv2-list-heading"><div><h1>Projects</h1>' +
    '<p>Manage all ongoing and completed projects</p></div>' +
    '<a class="pv2-button pv2-primary">New Project from Won Lead</a></header>' +
    '<label class="pv2-search"><input aria-label="Search projects"/></label>' +
    '<nav class="pv2-filter-tabs"><button class="selected">All 12</button>' +
    '<button>Ongoing 5</button><button>Completed 3</button><button>On Hold 2</button></nav>' +
    '<section class="pv2-project-list">' +
    Array.from(
      { length: 4 },
      (_, i) =>
        '<a class="pv2-project-card"><span class="pv2-project-visual tone-' +
        i +
        '">⌂</span>' +
        '<span class="pv2-project-card-body"><strong>3BHK Independent House Project - Hyderabad</strong>' +
        '<small>Residential construction · Kondapur, Hyderabad</small>' +
        '<small>Client Suresh Kumar · Ground + 1</small></span>' +
        '<span class="pv2-card-end"><span class="pv2-status good">Ongoing</span>' +
        '<span class="pv2-card-progress"><span class="pv2-bar"><span style="width:38%"></span></span>' +
        '<strong>38%</strong></span></span></a>',
    ).join('') +
    '</section>',
);
const overview = shell(
  '<nav class="pv2-crumb">Projects › Project › Overview</nav>' +
    '<section class="pv2-project-header"><div class="pv2-project-identity">' +
    '<span class="pv2-project-thumb">⌂</span><div><h1>3BHK Independent House in Uppal</h1>' +
    '<div class="pv2-project-meta"><span>PRJ-00008</span><span>Residential construction</span>' +
    '<span>Uppal Hyderabad</span></div></div><span class="pv2-status good">Ongoing</span></div>' +
    '<nav class="pv2-project-tabs">' +
    [
      'Overview',
      'Timeline',
      'Documents',
      'Payments',
      'Procurement',
      'Labour',
      'Execution',
      'Checks',
      'Designs & Plans',
      'Team & Access',
    ]
      .map(
        (x, i) =>
          '<a ' + (i === 0 ? 'class="selected"' : '') + '>' + x + '</a>',
      )
      .join('') +
    '</nav></section>' +
    '<div class="pv2-content"><section class="pv2-stat-grid">' +
    [
      'Client Payments Received|₹18,00,000',
      'Site Expenditure|—',
      'Net Site Cash Position|—',
      'Project Completion|38%',
    ]
      .map((x) => {
        const [name, value] = x.split('|');
        return (
          '<article class="pv2-stat">' +
          '<span class="pv2-stat-icon green">₹</span><div><small>' +
          name +
          '</small>' +
          '<strong>' +
          value +
          '</strong><p>Recorded finance and progress</p></div></article>'
        );
      })
      .join('') +
    '</section>' +
    '<div class="pv2-overview-split"><section class="pv2-panel">' +
    '<header class="pv2-section-header"><div><h2>Current Stage</h2></div></header>' +
    '<div class="pv2-stage-preview"><div><h3>Foundation - Column Steel Work</h3>' +
    '<p>In progress</p></div></div></section>' +
    '<section class="pv2-panel"><header class="pv2-section-header"><div>' +
    '<h2>Today & Next Work</h2></div></header>' +
    '<div class="pv2-work-day"><strong>Today: Steel column work</strong></div>' +
    '<div class="pv2-work-day"><strong>Tomorrow: Shuttering</strong></div>' +
    '</section></div></div>',
);

test('Projects list and Overview are responsive without document horizontal overflow', async ({
  page,
}) => {
  for (const markup of [directory, overview]) {
    await page.setContent(markup);
    for (const width of [320, 360, 390, 430, 600, 768, 1024, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      const x = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(x.scroll, 'overflow at ' + width).toBeLessThanOrEqual(x.width + 1);
      await expect(page.locator('h1')).toBeVisible();
    }
  }
});
test('all project detail pages require authentication', async ({ page }) => {
  await page.goto(
    '/dashboard/projects/00000000-0000-4000-8000-000000000001/checks',
  );
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

const nextAction = shell(
  '<section class="pv2-project-header"><div class="pv2-project-identity">' +
    '<span class="pv2-project-thumb">⌂</span><div><h1>Ramya Dream Home</h1></div></div>' +
    '<div class="pv2-project-header-actions">' +
    '<details class="pv2-header-drawer"><summary class="pv2-button pv2-outline">Edit project</summary>' +
    '<div class="pv2-header-drawer-body"><form><label>Project name<input value="Ramya Dream Home"/></label></form></div></details>' +
    '<details class="pv2-header-drawer" open><summary class="pv2-button pv2-outline">Share with client</summary>' +
    '<div class="pv2-header-drawer-body"><h2>Client App access</h2><input placeholder="Client email"/></div></details></div>' +
    '<nav class="pv2-project-tabs"><a class="selected">Overview</a><a>Timeline</a><a>Quote & Agreement</a></nav></section>' +
    '<div class="pv2-content"><section class="pv2-priority-wrap">' +
    '<div class="pv2-priority-main"><div class="pv2-priority-eyebrow"><span class="pv2-next-pulse"></span> NEXT ACTION</div>' +
    '<h2>Site inspection</h2><p class="pv2-priority-description">Confirm boundaries and levels.</p>' +
    '<div class="pv2-checklist-inline"><span class="done">Signed agreement</span>' +
    '<span>Site inspection</span><span>Measurements</span></div>' +
    '<details class="pv2-next-drawer" open><summary>Record site inspection</summary>' +
    '<form class="pv2-inline-work-form"><label>Site inspection report' +
    '<textarea>Survey details</textarea></label><button class="pv2-next-primary">Complete site inspection</button></form>' +
    '</details></div><aside class="pv2-priority-payment">' +
    '<div class="pv2-next-payment-heading"><span class="pv2-priority-coin">₹</span>' +
    '<div><strong>Advance payment</strong><small>Not yet requested</small></div></div>' +
    '<strong class="pv2-priority-amount">Not invoiced</strong>' +
    '<details class="pv2-next-drawer" open><summary>Issue advance invoice</summary>' +
    '<form class="pv2-inline-work-form"><label>Advance percentage<input type="number" value="10"/></label>' +
    '<button class="pv2-next-primary">Issue advance proforma</button></form></details></aside></section></div>',
);
test('project inline edit/share and next-action forms fit narrow mobile widths', async ({
  page,
}) => {
  await page.setContent(nextAction);
  for (const width of [320, 360, 390, 430, 600, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(
      size.scroll,
      'inline project action overflow at ' + width,
    ).toBeLessThanOrEqual(size.width + 1);
    await expect(
      page.getByRole('heading', { name: 'Site inspection' }),
    ).toBeVisible();
  }
});
