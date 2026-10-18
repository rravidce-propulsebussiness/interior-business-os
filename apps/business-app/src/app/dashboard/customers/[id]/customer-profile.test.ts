import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const profile=read('./page.tsx');
const index=read('../page.tsx');
const activity=read('./activity/page.tsx');
const navigation=read('../../owner-workspace-navigation.ts');
const projects=read('../../projects/project-v2-list.tsx');
const form=read('../../projects/new-project-for-customer.tsx');
const access=read('../../projects/project-client-access.tsx');
const view=read('../../projects/project-v2-view.tsx');

describe('Clients workspace retired without removing customer data or client app access',()=>{
 it('removes the duplicate Clients sidebar and redirects old bookmarks',()=>{
  expect(navigation).not.toContain("label:'Clients'");
  expect(index).toContain("redirect('/dashboard/projects')");
  expect(profile).toContain("redirect('/dashboard/projects?customer='+encodeURIComponent(id))");
  expect(activity).toContain("redirect('/dashboard/projects?customer='+encodeURIComponent(id))");
 });
 it('keeps one New Project form and existing customer selection inside Projects',()=>{
  expect(projects).toContain('<NewProjectForCustomer customers={customers} initialCustomerId={clientId}/>');
  expect(form).toContain('Select an existing customer from your company.');
  expect(form).toContain('createExistingClientProject(selected,form)');
  expect(projects).not.toContain('/dashboard/customers/');
 });
 it('keeps client app sharing inside the same project Team workspace',()=>{
  expect(view).toContain("cur(p.id,'team')+'#client-portal-access'");
  expect(view).toContain('<ProjectClientAccess projectId={d.project.id} customerId={d.project.customerId}/>');
  expect(access).toContain('client_portal_grantable_projects');
  expect(access).toContain('client_portal_access_list');
  expect(access).toContain(".eq('id',projectId)");
 });
});
