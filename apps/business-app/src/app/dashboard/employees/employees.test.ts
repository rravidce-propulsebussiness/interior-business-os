import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';

const load=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');
const page=load('./page.tsx');
const ui=load('./employee-workspace.tsx');
const actions=load('./actions.ts');
const proofRoute=load('./documents/[id]/route.ts');
const proof=load('./proof-storage.ts');
const sql=load('../../../../../../packages/database/supabase/migrations/20261017001600_company_employee_directory.sql');
describe('Employees directory and sensitive access',()=>{
 it('uses one dedicated, permission-guarded company page',()=>{
  expect(page).toContain("requirePermission(org,'team.manage')");
  expect(page).toContain('EmployeeWorkspace');
  expect(page).toContain('employeeRepository(client)');
  expect(page).not.toContain('demoEmployees');
 });
 it('keeps real employee profiles and private ID proofs distinct from team logins',()=>{
  expect(sql).toContain('private.company_employee_directory');
  expect(sql).toContain('private.company_employee_documents');
  expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  expect(sql).toContain("private.require_permission(p_org,'team.manage')");
  expect(sql).toContain("private.has_permission(p_org,'payment.view')");
  expect(sql).not.toContain('CREATE POLICY employee_public');
 });
 it('provides the designed search, tabbed detail, payroll, proof and attendance UI',()=>{
  for(const label of ['Total Employees','Active on Site','Pending KYC',
   'Estimated Monthly Payroll','All Employees','Site Team','Office Staff',
   'overview','documents','payroll','attendance','Add Employee','Export']){
    expect(ui).toContain(label);
   }
  expect(ui).toContain('saveEmployeeProfile');
  expect(ui).toContain('recordEmployeeAttendance');
  expect(ui).toContain('saveEmployeeProof');
 });
 it('never serves uploaded identity documents from a public bucket',()=>{
  expect(proof).toContain("public:false");
  expect(proof).toContain('MAX_PROOF_BYTES');
  expect(proofRoute).toContain("requirePermission(org.organizationId,'team.manage')");
  expect(proofRoute).toContain('employeeRepository(client).proof');
  expect(proofRoute).toContain("'Cache-Control':'private, no-store'");
  expect(actions).toContain("requirePermission(organizationId,'payment.record')");
 });
});
