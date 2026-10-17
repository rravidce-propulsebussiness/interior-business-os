import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const listing=source('./page.tsx');
const detail=source('./[id]/page.tsx');
const site=source('./[id]/site/page.tsx');
const tabs=source('./[id]/project-mobile-tabs.tsx');
const command=source('./[id]/site/command-overview.tsx');
const journey=source('./[id]/site/construction-journey.tsx');
const siteCss=source('./[id]/site/site-premium.css');

describe('simplified project workspace',()=>{
 it('uses five main destinations and routes less common work through More',()=>{
  for(const label of ['Overview','Timeline','Updates','Materials','More']){
   expect(tabs).toContain("label:'"+label+"'");
  }
  for(const label of ['Agreement & design','Quality checks','Project team','Documents & photos',
    'Curing & security','Handover','Project finances']){
   expect(tabs).toContain("label:'"+label+"'");
  }
  expect(tabs).toContain("window.addEventListener('hashchange',sync)");
  expect(site).toContain('data-project-focus={initialSiteFocus}');
  expect(siteCss).toContain('data-project-focus="timeline"');
  expect(siteCss).toContain('data-project-focus="materials"');
  expect(siteCss).toContain('data-project-focus="quality"');
 });
 it('removes duplicate project-wide summaries without removing the real field forms',()=>{
  expect(site).not.toContain('<SiteActivity');
  expect(command).not.toContain('className="sc-metrics"');
  expect(journey).not.toContain('className="cj-activity"');
  expect(detail).not.toContain('className="pd-mobile-actions"');
  expect(detail).not.toContain('className="pd-media-columns"');
  expect(site).toContain('operation="report_add"');
  expect(site).toContain('operation="material_add"');
  expect(site).toContain('operation="gate_add"');
  expect(site).toContain('operation="handover"');
  expect(site).toContain('<AgreementReadinessPanel');
  expect(site).toContain('<ConstructionJourney');
 });
 it('keeps progress based on real tasks and existing Won lead conversion',()=>{
  expect(listing).toContain('workCompletionByProject');
  expect(detail).toContain('workCompletionByProject');
  expect(detail).toContain('<ProjectCommercial');
  expect(detail).toContain('title="Save area"');
  expect(detail).toContain('title="Save project"');
  expect(listing).not.toContain('New Project');
 });
});
