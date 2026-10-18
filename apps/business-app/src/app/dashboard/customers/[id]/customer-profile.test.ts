import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const style = readFileSync(
  new URL('./customer-profile.css', import.meta.url),
  'utf8',
);

describe('Customer Profile uses one navigation and one copy of related actions', () => {
  it('keeps the customer record and its protected company navigation', () => {
    expect(page).toContain("from '../../owner-shell'");
    expect(page).toContain('<OwnerShell');
    expect(page).toContain('currentHref="/dashboard/customers"');
    expect(page).toContain("from('customers')");
    expect(page).toContain('Customer account');
  });

  it('links back to original converted leads without duplicating lead records', () => {
    expect(page).toContain('<OriginLeads customerId={id} />');
    expect(page).toContain('cp-origin-near-header');
    expect(page).not.toContain("from('leads').insert");
  });

  it('does not render an extra fixed bottom navigation or repeated related-records menu', () => {
    expect(page).not.toContain('cp-mobile-nav');
    expect(style).not.toContain('.cp-mobile-nav');
    expect(page).not.toContain('id="records"');
    expect(page).not.toContain('id="payments"');
    expect(page).not.toContain('href="#payments"');
    expect(page).toContain('label="Account statement"');
    expect(page).toContain(
      'href={canSeeStatement ? statementHref : undefined}',
    );
    expect(page).toContain('id="projects"');
    expect(page).toContain('id="quotes"');
    expect(page).toContain('id="activity"');
  });
});


const directory = readFileSync(new URL('../page.tsx',import.meta.url),'utf8');
const newProject = readFileSync(new URL('./new-client-project.tsx',import.meta.url),'utf8');
const createAction = readFileSync(new URL('./customer-project-actions.ts',import.meta.url),'utf8');
const light = readFileSync(new URL('./client-profile-light.css',import.meta.url),'utf8');

describe('Client account canonical projects and shared dashboard UI',()=>{
 it('excludes retired quotation prospects without deleting their quote history',()=>{
  expect(page).toContain(".eq('is_sales_prospect', false)");
  expect(page).toContain(".eq('removed_from_workspace', false)");
  expect(directory).toContain(".eq('removed_from_workspace', false)");
  expect(page).toContain(".neq('status', 'cancelled')");
  expect(page).toContain("const projectHref = '/dashboard/projects?customer='");
  expect(page).toContain("projects.map((project)");
 });
 it('creates a separate project for the same client without a second project OS',()=>{
  expect(page).toContain('<NewClientProject customerId={id} city={customerCity}/>');
  expect(page).toContain('dashboardBrand');
  expect(page).not.toContain("projectHref + '&new=1'");
  expect(newProject).toContain('createExistingClientProject(customerId,form)');
  expect(newProject).toContain("router.push('/dashboard/projects/'+result.projectId)");
  expect(createAction).toContain("'customer_project_create'");
  expect(createAction).not.toContain(".from('customers').insert");
 });
 it('matches dashboard branding, with one mobile menu and no duplicate fake header',()=>{
  expect(light).toContain('#fffaf7');
  expect(light).toContain('.cp-new-project-panel');
  expect(light).toContain('.owner-topbar::before{display:none!important;content:none!important}');
  expect(page).not.toContain('cp-mobile-nav');
 });
});
