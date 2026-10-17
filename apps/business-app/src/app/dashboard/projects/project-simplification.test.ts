import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const listing=source('./page.tsx');
const detail=source('./[id]/page.tsx');
const workspace=source('./[id]/project-command-centre.tsx');
const styles=source('./[id]/project-command-centre.css');
const site=source('./[id]/site/page.tsx');
const tabs=source('./[id]/project-mobile-tabs.tsx');
const command=source('./[id]/site/command-overview.tsx');
const journey=source('./[id]/site/construction-journey.tsx');
const siteCss=source('./[id]/site/site-premium.css');

describe('simplified project workspace',()=>{
 it('keeps the existing five-tab field workspace for authorized site roles',()=>{
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
 it('shows one project module per section without duplicated tiles or timeline',()=>{
  expect(workspace).not.toContain('pcc-module-grid');
  expect(workspace).not.toContain('pcc-timeline-aside');
  expect(workspace).not.toContain('pcc-sidebar');
  expect(styles).not.toContain('.pcc-module-grid');
  expect(styles).not.toContain('.pcc-timeline-aside');
  expect(workspace).toContain('title="Materials & Procurement"');
  expect(workspace).not.toContain('title="Materials"');
  expect(workspace).not.toContain('title="Procurement"');
  expect((workspace.match(/<Panel id="timeline"/g)??[]).length).toBe(1);
  expect((workspace.match(/<Panel id="materials"/g)??[]).length).toBe(1);
  expect(workspace).toContain('className="pcc-workspaces"');
  expect(workspace).not.toContain('className="pcc-section-columns"');
  expect(styles).not.toContain('.pcc-section-columns');
  for(const id of ['documents','designs','team','materials','labour','execution','checks','timeline']){
   expect(workspace).toContain("selectedView==='"+id+"'");
  }
  expect(workspace).toContain("canFinance&&selectedView==='payments'");
  expect(workspace).toContain("selectedView==='overview'&&");
  expect(workspace).toContain("href={workspaceUrl(section.id)}");
  expect(detail).toContain('searchParams');
  expect(detail).toContain('view={view??'overview'}');
  expect(site).not.toContain('<SiteActivity');
  expect(command).not.toContain('className="sc-metrics"');
  expect(journey).not.toContain('className="cj-activity"');
 });
 it('keeps the real project settings, task progress, site forms and client financial history',()=>{
  expect(listing).toContain('workCompletionByProject');
  expect(detail).toContain('workCompletionByProject');
  expect(detail).toContain('construction_stage_record_read');
  expect(workspace).toContain('title="Save project"');
  expect(workspace).toContain('MasterForm entity="projects"');
  expect(workspace).toContain('Request, order or record receipt');
  expect(workspace).toContain('Only verified Finance receipts');
  expect(site).toContain('operation="report_add"');
  expect(site).toContain('operation="material_add"');
  expect(site).toContain('operation="gate_add"');
  expect(site).toContain('operation="handover"');
  expect(site).toContain('<AgreementReadinessPanel');
  expect(site).toContain('<ConstructionJourney');
  expect(listing).not.toContain('New Project');
 });
});
