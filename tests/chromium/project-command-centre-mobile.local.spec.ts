import { expect,test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css=readFileSync(resolve(process.cwd(),
 'apps/business-app/src/app/dashboard/projects/[id]/project-command-centre.css'),'utf8');

const nav=[
 ['Overview','overview'],['Timeline','timeline'],['Execution','execution'],
 ['Materials','materials'],['Checks','checks'],['Payments','payments'],
];
const markup=[
 '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<style>html,body{margin:0;padding:0;font-family:Arial,sans-serif}',css,'</style></head><body>',
 '<main class="pcc-page">',
 '<nav class="pcc-breadcrumb"><a>Projects</a><span>›</span>',
 '<strong>3BHK Independent House Kothapet</strong></nav>',
 '<header class="pcc-heading"><div><h1>Project Overview</h1>',
 '<p>3BHK Independent House Kothapet · PRJ-2026-000008</p></div>',
 '<a class="pcc-primary">Edit Project</a></header>',
 '<nav class="pcc-workspaces" aria-label="Project workspaces">',
 ...nav.map(([name,id])=>'<a '+(id==='overview'?'class="active" aria-current="page"':'')+
  ' href="?view='+id+'">'+name+'</a>'),
 '<details class="pcc-more-menu"><summary>More ⌄</summary><div class="pcc-more-links">',
 ...[['Documents','documents'],['Designs','designs'],['Team & Owner','team'],['Labour','labour']]
  .map(([name,id])=>'<a href="?view='+id+'">'+name+'</a>'),
 '</div></details></nav>',
 '<section class="pcc-project-hero pcc-no-photo"><div class="pcc-project-info">',
 '<div class="pcc-project-title"><h2>A Very Long Project Name In Hyderabad With Multiple Floors</h2>',
 '<span class="pcc-pill pcc-pill-good">Active</span></div>',
 '<small>PRJ-2026-000008 · Residential Construction</small>',
 '<div class="pcc-project-facts">',
 ...['Client|Suresh Reddy','Site address|H.No 12-45, Ramalingeswara Colony Kothapet Hyderabad Telangana',
  'Current delivery|Execution in progress','Areas & rooms|12 recorded'].map(value=>{
  const [label,detail]=value.split('|');
  return '<div><span>'+label+'<strong>'+detail+'</strong></span></div>';
 }),
 '</div><div class="pcc-hero-bottom"><div><small>Overall work progress</small><strong>38%</strong></div>',
 '<div class="pcc-progress"><span style="width:38%"></span></div></div></div></section>',
 '<section class="pcc-metrics">',
 ...['Current stage|Foundation works','Open quality checks|2','Material needs|4'].map(value=>{
  const [label,number]=value.split('|');
  return '<article><span class="pcc-metric-icon orange">✓</span><div>'+
   '<small>'+label+'</small><strong>'+number+'</strong><p>Recorded from project</p></div></article>';
 }),
 '</section><div class="pcc-layout"><div class="pcc-main">',
 '<section class="pcc-overview-actions">',
 ...['Add site update','Request material','Record check','View timeline'].map(label=>
  '<a><span>✚</span>'+label+'</a>'),
 '</section>',
 '<section class="pcc-panel pcc-next-work"><header class="pcc-panel-heading">',
 '<div><h2>Next Work</h2><p>Upcoming work and tomorrow’s plan</p></div>',
 '<a>Plan work ↗</a></header>',
 '<div class="pcc-next-work-items"><div><small>Next activity</small>',
 '<strong>Foundation excavation tomorrow</strong></div><div><small>Tomorrow’s plan</small>',
 '<strong>Inspect steel cover and curing</strong></div></div></section>',
 '<section class="pcc-panel pcc-recent-activity"><header class="pcc-panel-heading">',
 '<div><h2>Recent Activity</h2><p>Latest updates from the worksite</p></div>',
 '<a>Full history ↗</a></header>',
 '<div class="pcc-record"><span class="pcc-row-icon">✓</span>',
 '<div class="pcc-row-content"><strong>Excavation completed</strong>',
 '<small>17 October</small></div></div></section>',
 '</div></div></main></body></html>',
].join('');

test('focused project overview fits phone, tablet and desktop without stacked modules',async({page})=>{
 await page.setContent(markup);
 for(const width of [320,360,390,430,600,750,768,1024,1280,1440,1680]){
  await page.setViewportSize({width,height:900});
  const d=await page.evaluate(()=>({
   scroll:document.documentElement.scrollWidth,
   width:document.documentElement.clientWidth,
  }));
  expect(d.scroll,'page overflow at '+width).toBeLessThanOrEqual(d.width+1);
  await expect(page.locator('.pcc-heading h1')).toBeVisible();
  await expect(page.locator('.pcc-workspaces')).toBeVisible();
  await expect(page.locator('.pcc-next-work')).toBeVisible();
  expect(await page.locator('.pcc-focused-panel').count()).toBe(0);
  expect(await page.locator('.pcc-panel-heading h2').count()).toBe(2);
 }
 await page.locator('.pcc-more-menu summary').click();
 await expect(page.locator('.pcc-more-links')).toBeVisible();
 await expect(page.locator('.pcc-more-links a')).toHaveCount(4);
});

test('anonymous users cannot inspect project workspaces',async({page})=>{
 await page.goto('/dashboard/projects/00000000-0000-4000-8000-000000000001?view=payments');
 await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
