import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=file('./page.tsx');
const ui=file('./team-access-workspace.tsx');
const css=file('./team-access.css');
const server=file('./actions.ts');
const navigation=file('../../owner-workspace-navigation.ts');

describe('premium Team & Access replaces legacy page without duplicating HR',()=>{
 it('reuses the shared company shell and existing team/role data',()=>{
  expect(page).toContain('<OwnerShell');
  expect(page).toContain('ownerWorkspaceNavigation(context)');
  expect(page).toContain('repository.team(organizationId)');
  expect(page).toContain('repository.employeeInvitations(organizationId)');
  expect(page).toContain("from('membership_roles')");
  expect(page).toContain("from('roles')");
  expect(page).toContain("from('profiles')");
  expect(page).not.toContain('Employees &amp; roles');
  expect(page).not.toContain('bg-slate-950');
 });
 it('preserves all membership, email invitation and role operations',()=>{
  for(const name of ['changeMembershipRole','changeMembershipStatus',
   'inviteEmployeeByEmail','resendEmployeeEmail','revokeEmployeeEmail',
   'createCustomRole','createRoleFromPreset']){
   expect(ui).toContain(name);
   expect(server).toContain('export async function '+name);
  }
  expect(ui).toContain('person.protected');
  expect(page).toContain('ownerRoleIds');
  expect(ui).toContain('name="branchId"');
  expect(ui).toContain('name="roleIds"');
  expect(ui).toContain('name="permissions"');
 });
 it('has premium responsive member table, invitations, roles and detail views',()=>{
  for(const label of ['Team Members','Active Access','Pending Invites','Company Roles',
   'Roles &amp; Permissions','Invite team member','Create custom role',
   'Assigned roles','Effective role grants'])expect(ui).toContain(label);
  expect(css).toContain('.team-mobile-members');
  expect(css).toContain('@media(max-width:760px)');
  expect(ui).toContain('team-table-wrap');
  expect(ui).toContain('team-detail');
 });
 it('does not duplicate employee personal records, ID proofs or payroll',()=>{
  expect(page).not.toContain('employeeRepository(');
  expect(ui).not.toContain('saveEmployeeProfile(');
  expect(ui).not.toContain('recordEmployeeSalary(');
  expect(ui).not.toContain('saveEmployeeProof(');
  expect(ui).toContain('href="/dashboard/employees"');
  expect(navigation).toContain("label:'Employees',href:'/dashboard/employees'");
  expect(navigation).toContain("label:'Team',href:'/dashboard/company/team'");
 });
});