import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('Projects fresh UI keeps canonical records and URLs',()=>{
 it('serves the new directory and project overview',()=>{
  expect(read('./page.tsx')).toContain('ProjectsDirectory');
  expect(read('./[id]/page.tsx')).toContain('ProjectV2Page');
  expect(read('./[id]/site/page.tsx')).toContain("'/dashboard/projects/'+id+'/timeline'");
 });
 it('retains the secured project actions and private media route',()=>{
  expect(read('./[id]/site/actions.ts')).toContain("project_site_command");
  expect(read('./[id]/site/media/[mediaId]/route.ts')).toContain("project_site_media_get");
 });
});
