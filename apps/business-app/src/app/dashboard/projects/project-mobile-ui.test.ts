import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const listing=read('./page.tsx');
const overview=read('./[id]/page.tsx');
const workspace=read('./[id]/project-command-centre.tsx');
const site=read('./[id]/site/page.tsx');
const journey=read('./[id]/site/construction-journey.tsx');
const command=read('./[id]/site/command-overview.tsx');
const tabs=read('./[id]/project-mobile-tabs.tsx');
const activity=read('./[id]/site/site-activity.tsx');

describe('project mobile command centre',()=>{
 it('uses actual project records instead of a duplicate creation path or fake progress',()=>{
  expect(listing).toContain('workCompletionByProject');
  expect(overview).toContain('workCompletionByProject');
  expect(listing).not.toContain('New Project');
  expect(listing).toContain('proj-card-hit-area');
  expect(listing).toContain('proj-mobile-filters');
 });
 it('uses one project overview navigation and retains role-specific Site Delivery tabs',()=>{
  expect(overview).toContain('<ProjectCommandCentre');
  expect(workspace).toContain('className="pcc-workspaces"');
  expect(workspace).toContain("selectedView==='overview'");
  expect(workspace).toContain("selectedView==='timeline'");
  expect(workspace).toContain("selectedView==='materials'");
  expect(workspace).toContain("selectedView==='checks'");
  expect(overview).toContain('searchParams');
  expect(overview).toContain("view={view??'overview'}");
  expect(workspace).not.toContain('pcc-module-grid');
  expect(workspace).not.toContain('pcc-sidebar');
  expect(site).toContain('<ProjectMobileTabs');
  expect(tabs).toContain("'#construction-timeline':'timeline'");
  expect(tabs).toContain("'#daily-reports':'site'");
  expect(tabs).toContain("'#materials':'materials'");
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
 it('uses actual site photographs and latest worker count and work plans',()=>{
  expect(workspace).toContain('unoptimized fill');
  expect(workspace).toContain("siteUrl+'/media/'+heroMedia.id");
  expect(workspace).toContain("progress===null?'Not tracked'");
  expect(workspace).toContain("textValue(latestReport,'tomorrow_plan')");
  expect(activity).toContain('sc-report-photos');
  expect(activity).toContain("field(latest, 'worker_count')");
 });
});
