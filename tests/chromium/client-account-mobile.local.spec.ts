import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const base=readFileSync(resolve(process.cwd(),'apps/business-app/src/app/dashboard/customers/[id]/customer-profile.css'),'utf8');
const brand=readFileSync(resolve(process.cwd(),'apps/business-app/src/app/dashboard/customers/[id]/client-profile-light.css'),'utf8');
const markup=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Arial,sans-serif}*,*::before,*::after{box-sizing:border-box}
${base}\n${brand}</style></head><body><div class="customer-profile-theme client-profile-light">
<div class="owner-layout"><div class="owner-workspace" style="min-width:0;width:100%">
<main class="cp-page"><nav class="cp-breadcrumb">Dashboard / Clients / Client account</nav>
<header class="cp-hero"><span class="cp-avatar">R</span><div class="cp-hero-content">
<p class="cp-account-eyebrow">Client account · One customer, many projects</p>
<h1>Ramya</h1><span class="cp-status cp-status-active">● Active customer</span>
<div class="cp-reference"><strong>Customer ID: CRN-896F31BB9F3A</strong><button class="cp-copy">Copy</button></div>
<div class="cp-service-tags"><span class="cp-service-tag construction">Construction</span></div></div></header>
<section class="cp-stats">
 <article class="cp-stat"><span class="cp-stat-icon">▤</span><div class="cp-stat-content"><span>Quotations</span><strong>3</strong></div></article>
 <article class="cp-stat"><span class="cp-stat-icon">▣</span><div class="cp-stat-content"><span>Projects</span><strong>1</strong></div></article>
 <article class="cp-stat"><span class="cp-stat-icon">₹</span><div class="cp-stat-content"><span>Statement</span><strong>View</strong></div></article>
</section>
<div class="cp-actions"><a class="cp-action">Call</a><a class="cp-action">WhatsApp</a>
<a class="cp-action">New quote</a><button class="cp-action cp-new-project-button">New project</button>
<section class="cp-new-project-panel"><div class="cp-new-project-heading"><strong>New project for this client</strong>
<p>Reuse the same customer for interiors or another home.</p></div>
<form class="cp-new-project-form"><label>Project name<input value="Ramya Second Home"/></label>
<label>Service<select><option>Interior Design</option></select></label>
<label>Project type<select><option>Residential</option></select></label>
<label>Site city<input value="Hyderabad"/></label>
<p class="cp-new-project-hint">The same client account, new project.</p>
<button class="cp-new-project-submit">Create &amp; open project</button></form></section></div>
<nav class="cp-tabs"><a class="cp-tab-current">Overview</a><a>Projects</a><a>Quotes</a><a>Activity</a></nav>
<section class="cp-panel"><h2>Projects</h2><p>Ramya Dream Home · Active</p></section>
</main></div></div></div></body></html>`;

test('premium Client account and additional project form fit mobile and desktop',async({page})=>{
 await page.setContent(markup);
 for(const width of [320,360,390,430,600,768,1024,1280]){
  await page.setViewportSize({width,height:900});
  const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,
   scrollWidth:document.documentElement.scrollWidth}));
  expect(size.scrollWidth,'client overflow at '+width).toBeLessThanOrEqual(size.width+1);
  await expect(page.getByRole('heading',{name:'Ramya'})).toBeVisible();
 }
});
