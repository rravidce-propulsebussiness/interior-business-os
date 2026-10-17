import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const css=readFileSync(resolve(process.cwd(),
 'apps/business-app/src/app/dashboard/projects/[id]/project-command-centre.css'),'utf8');
const stats=['Current stage','Open quality checks','Material needs',
 'Labour on latest report','Payment milestones'];
const modules=['Documents & Agreement','Client Payments','Designs','Team & Owner',
 'Materials & Procurement','Labour','Execution','Checks & Quality','Timeline'];
const panels=['Documents & Agreement','Client Payments','Designs & Approvals',
 'Team & Owner Access','Materials & Procurement','Labour','Execution Updates','Checks & Quality'];
const markup=[
 '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<style>html,body{margin:0;padding:0;font-family:Arial,sans-serif}',css,'</style></head><body>',
 '<main class="pcc-page">',
 '<nav class="pcc-breadcrumb"><a>Projects</a> › <strong>3BHK Independent House Kothapet</strong></nav>',
 '<header class="pcc-heading"><div><h1>Project Command Centre</h1>',
 '<p>Manage execution, documents, people, materials and payments from one place.</p></div>',
 '<a class="pcc-primary">Edit Project</a></header>',
 '<section class="pcc-project-hero"><div class="pcc-photo"><div class="pcc-photo-fallback">',
 '<span>Add site photos from Site Delivery</span></div></div><div class="pcc-project-info">',
 '<div class="pcc-project-title"><h2>A Very Long Project Name In Hyderabad With Multiple Floors</h2>',
 '<span class="pcc-pill pcc-pill-good">Active</span></div><small>PRJ-2026-000008 · Residential Construction</small>',
 '<div class="pcc-project-facts">',
 ...['Client|Suresh Reddy','Site address|H.No 12-45, Ramalingeswara Colony Kothapet Hyderabad Telangana',
 'Current delivery|Execution in progress','Areas & rooms|12 recorded'].map(value=>{
  const [label,detail]=value.split('|');
  return '<div><span>'+label+'<strong>'+detail+'</strong></span></div>';
 }),'</div><div class="pcc-hero-bottom"><div><small>Overall work progress</small><strong>38%</strong></div>',
 '<div class="pcc-progress"><span style="width:38%"></span></div></div></div></section>',
 '<section class="pcc-metrics">',
 ...stats.map(label=>'<article><span class="pcc-metric-icon orange">⊕</span>'+
  '<div><small>'+label+'</small><strong>24</strong><p>Real project records</p></div></article>'),
 '</section><nav class="pcc-tabs">',
 ...['Overview',...modules].map(label=>'<a>'+label+'</a>'),
 '</nav><div class="pcc-layout"><div class="pcc-main">',
 '<section class="pcc-panel pcc-next-work"><header class="pcc-panel-heading">',
 '<h2>Upcoming Work</h2></header>',
 '<div class="pcc-next-work-items"><div><small>Next activity</small>',
 '<strong>Foundation excavation tomorrow</strong></div><div><small>Tomorrow’s plan</small>',
 '<strong>Inspect steel cover and curing</strong></div></div></section>',
 '<section class="pcc-section-columns">',
 ...panels.map(label=>'<section class="pcc-panel"><header class="pcc-panel-heading">'+
 '<div><h2>'+label+'</h2><p>Actual project data and repeated records in one place</p></div>'+
 '<a>Open workspace ↗</a></header><div class="pcc-record-list"><div class="pcc-record">'+
 '<span class="pcc-row-icon">▣</span><div class="pcc-row-content">'+
 '<strong>A very long material or construction record name with details</strong>'+
 '<small>15000 sq ft · Supplier with a long name</small></div>'+
 '<span class="pcc-pill pcc-pill-pending">In progress</span></div></div></section>'),
 '</section><section class="pcc-panel"><header class="pcc-panel-heading">',
 '<h2>Project Timeline & Work History</h2></header>',
 ...[1,2,3].map(i=>'<details class="pcc-stage" open><summary>'+
 '<span class="pcc-stage-index">'+i+'</span><span class="pcc-stage-info">'+
 '<strong>Foundation and column site work</strong><small>Construction · 12 tasks</small></span>'+
 '<span class="pcc-pill pcc-pill-pending">In progress</span></summary>'+
 '<div class="pcc-stage-content"><p>Records repeat every day</p>'+
 '<div class="pcc-stage-tags"><span>4 material links</span><span>2 inspections</span></div>'+
 '</div></details>'),
 '</section></div></div></main></body></html>',
].join('');

test('project command centre has no horizontal overflow across phone and desktop widths',async({page})=>{
 await page.setContent(markup);
 for(const width of [320,360,390,430,600,750,768,1024,1280,1440,1680]){
  await page.setViewportSize({width,height:900});
  const dimensions=await page.evaluate(()=>({
   doc:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,
  }));
  expect(dimensions.doc,'horizontal overflow at '+width).toBeLessThanOrEqual(dimensions.width+1);
  await expect(page.locator('.pcc-heading h1')).toBeVisible();
  await expect(page.locator('.pcc-next-work')).toBeVisible();
  await expect(page.locator('.pcc-section-columns')).toBeVisible();
  expect(await page.locator('.pcc-module-grid').count()).toBe(0);
  expect(await page.locator('.pcc-sidebar').count()).toBe(0);
  expect(await page.locator('.pcc-panel-heading h2')
   .filter({hasText:'Project Timeline & Work History'}).count()).toBe(1);
  expect(await page.locator('.pcc-panel-heading h2')
   .filter({hasText:'Materials & Procurement'}).count()).toBe(1);
 }
});
test('anonymous visitors cannot load project command centre',async({page})=>{
 await page.goto('/dashboard/projects/00000000-0000-4000-8000-000000000001');
 await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
