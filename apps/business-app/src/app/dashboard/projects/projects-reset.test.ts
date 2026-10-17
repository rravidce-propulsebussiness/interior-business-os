import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('project UI reset does not delete business records',()=>{
 it('retains one clean projects route, with older project paths redirected safely',()=>{
  const hub=read('./page.tsx');
  expect(hub).toContain('Ready for a fresh workspace');
  expect(hub).toContain('ownerWorkspaceNavigation(context)');
  expect(hub).not.toContain('project_site_read');
  expect(read('./[id]/page.tsx')).toContain("redirect('/dashboard/projects')");
  expect(read('./[id]/site/page.tsx')).toContain("redirect('/dashboard/projects')");
 });
 it('removes old project detail and execution UI without touching shared services',()=>{
  for(const path of [
   './[id]/project-command-centre.tsx',
   './[id]/project-command-centre.css',
   './[id]/site/construction-journey.tsx',
   './[id]/site/site-activity.tsx',
   './[id]/project-mobile-tabs.tsx',
   './projects-dashboard.css',
  ]) expect(existsSync(new URL(path,import.meta.url))).toBe(false);
  for(const path of [
   './[id]/site/actions.ts',
   './[id]/site/agreement-actions.ts',
   './[id]/site/media/[mediaId]/route.ts',
   './work-progress.ts',
  ]) expect(existsSync(new URL(path,import.meta.url))).toBe(true);
 });
});
