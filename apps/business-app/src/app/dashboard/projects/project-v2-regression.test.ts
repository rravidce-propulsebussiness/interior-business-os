import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const page=read('./page.tsx'),detail=read('./[id]/page.tsx'),
 sections=read('./[id]/[section]/page.tsx'),ui=read('./project-v2-view.tsx'),
 loader=read('./project-v2-data.ts'),forms=read('./project-v2-forms.tsx');
describe('Projects v2 one screen per route',()=>{
 it('restores project listing and deep links',()=>{
  expect(page).toContain('ProjectsDirectory');expect(detail).toContain('ProjectV2Page');
  expect(sections).toContain('ProjectV2Page');expect(ui).toContain('projectPages');
  expect(page).not.toContain('Ready for a fresh workspace');
 });
 it('keeps individual modules separate instead of one long stack',()=>{
  for(const name of ['Overview','Timeline','Documents','Payments','Procurement','Labour',
   'Execution','Checks','Designs & Plans','Team & Access'])expect(ui).toContain(name);
  expect(ui).toContain("pages[view]");
  expect(ui).not.toContain('pcc-module-grid');
  expect(ui).not.toContain('pcc-section-columns');
 });
 it('writes once through existing permission-checked actions',()=>{
  for(const name of ['saveProjectSite','uploadProjectSiteMedia','assignConstructionRole'])
   expect(forms).toContain(name);
  expect(loader).toContain("project_site_read");
  expect(loader).toContain("construction_project_read");
  expect(loader).toContain('workCompletionByProject');
  expect(ui).toContain("status==='recorded'");
  expect(loader).toContain('expenditure:null');
  expect(ui).toContain('Finance workspace');
 });
});
