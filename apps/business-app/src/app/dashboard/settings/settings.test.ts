import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { companyCategoryOptions } from './company-categories';

const read = (path:string) => readFileSync(new URL(path,import.meta.url),'utf8');
const page=read('./page.tsx');
const action=read('./actions.ts');
const sql=read('../../../../../../packages/database/supabase/migrations/20261017000600_unified_company_settings.sql');
const dashboard=read('../page.tsx');
const companyLegacy=read('../company/settings/page.tsx');
const quotesLegacy=read('../quotations/settings/page.tsx');
const billing=read('../billing/page.tsx');
const finance=read('../finance/page.tsx');
describe('unified company settings',()=>{
 it('contains the approved sections with responsive company and logo previews',()=>{
   expect(page).toContain("label:'Company Details'");
   expect(page).toContain("label:'Branding'");
   expect(page).toContain("label:'Invoice & GST'");
   expect(page).toContain("label:'Documents'");
   expect(page).toContain("label:'Payment Settings'");
   expect(page).toContain("label:'Team & Access'");
   expect(page).toContain("label:'Preferences'");
   expect(page).toContain('us-company-preview');
   expect(page).toContain('<SettingsHome sections={sections}/>');
   expect(page).not.toContain('<nav className="us-tabs"');
   expect(page).toContain('<OwnerShell');
   expect(companyCategoryOptions).toHaveLength(8);
 });
 it('prefills available source data, never invents GST or banking data',()=>{
   expect(page).toContain('repository.propulseCompanyProfile');
   expect(page).toContain("const synced=source.success?source.data:null");
   expect(page).toContain("identity.bankAccount");
   expect(page).toContain('invoiceProfile?.gstin');
   expect(page).toContain('client.rpc');
   expect(page).toContain("canEdit?client.rpc('organization_identity_settings_read'");
 });
 it('saves only authorized tenant settings and protects bank details',()=>{
   expect(action).toContain("requirePermission(context.organizationId,'organization.manage')");
   expect(action).toContain("organization_identity_settings_save");
   expect(action).toContain('inputSchema.safeParse');
   expect(sql).toContain("private.has_permission(p_org,'organization.manage')");
   expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
   expect(sql).toContain('FORCE ROW LEVEL SECURITY');
   expect(sql).toContain('REVOKE ALL ON private.organization_identity_settings');
   expect(sql).not.toContain('DROP TABLE');
   expect(sql).not.toContain('TRUNCATE');
 });
 it('redirects duplicate settings pages and dashboard has one settings navigation',()=>{
   expect(companyLegacy).toContain("redirect('/dashboard/settings?tab=company')");
   expect(quotesLegacy).toContain("redirect('/dashboard/settings?tab=branding')");
   expect(dashboard).not.toContain("href: '/dashboard/quotations/settings'");
   expect(dashboard).not.toContain("href: '/dashboard/company/settings'");
   expect(billing).toContain('Billing & Plans');
   expect(page).toContain('InvoiceTemplateSelector');
   expect(finance).not.toContain('Quick Actions');
 });
});
