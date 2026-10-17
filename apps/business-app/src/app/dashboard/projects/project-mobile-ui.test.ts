import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const listing=read('./page.tsx');
const overview=read('./[id]/page.tsx');
const site=read('./[id]/site/page.tsx');
const journey=read('./[id]/site/construction-journey.tsx');
const command=read('./[id]/site/command-overview.tsx');
const tabs=read('./[id]/project-mobile-tabs.tsx');
const activity=read('./[id]/site/site-activity.tsx');
describe('project mobile command centre',()=>{
 it('does not add a second project creation route or fake project progress',()=>{
   expect(listing).toContain('workCompletionByProject');
   expect(overview).toContain('workCompletionByProject');
   expect(listing).not.toContain('New Project');
   expect(listing).toContain('proj-card-hit-area');
   expect(listing).toContain('proj-mobile-filters');
 });
 it('uses one set of project section tabs with working existing destinations',()=>{
   expect(overview).toContain('<ProjectMobileTabs');
   expect(site).toContain('<ProjectMobileTabs');
   expect(tabs).toContain("'#construction-timeline':'timeline'");
   expect(tabs).toContain("'#daily-reports':'site'");
   expect(tabs).toContain("'#materials':'materials'");
   expect(overview).not.toContain('className="pd-tabs"');
   expect(command).not.toContain('className="sc-tabs"');
   expect(journey).not.toContain('className="cj-nav"');
   expect(site).not.toContain('aria-label="Project steps"');
 });
 it('preserves secured field reporting and role permissions',()=>{
   expect(site).toContain('<ConstructionJourney');
   expect(site).not.toContain('<SiteActivity');
   expect(site).toContain('operation="report_add"');
   expect(site).toContain('<AgreementReadinessPanel');
   expect(site).toContain('allowMaterials={(open || site.stage');
   expect(site).toContain('allowQuality={(open || site.stage');
   expect(site).not.toContain('className="sc-mobile-bottom"');
 });
 it('uses actual project site photographs and existing daily report details',()=>{
   expect(overview).toContain("'/dashboard/projects/'+id+'/site/media/'+photoId");
   expect(overview).toContain("'Not tracked'");
   expect(activity).toContain('sc-report-photos');
   expect(activity).toContain("field(latest, 'tomorrow_plan')");
   expect(activity).toContain("field(latest, 'worker_count')");
 });
});
