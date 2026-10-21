import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const page=read('./page.tsx');
const panel=read('./reset-test-data-panel.tsx');
const action=read('./test-reset-actions.ts');
const migration=read('../../../../../../packages/database/supabase/migrations/20261021000300_owner_test_data_reset.sql');
describe('Owner-only transactional test data reset',()=>{
 it('exists only inside Owner Settings Preferences',()=>{
  expect(page).toContain("tab==='preferences'&&isOwner&&canEdit");
  expect(page).toContain('ResetTestDataPanel');
  expect(page).toContain('owner_test_data_reset_preview');
  expect(page).toContain('ResetPreview');
 });
 it('requires preview, exact company phrase, and acknowledgement',()=>{
  expect(panel).toContain("confirmation===preview.required_phrase&&ack");
  expect(panel).toContain('Preview test data reset');
  expect(panel).toContain('Permanently reset test data');
  expect(panel).toContain('not deleted');
  expect(panel).toContain('signature:preview.signature,phrase:confirmation');
 });
 it('uses server-side owner authorization and resists stale confirmation',()=>{
  expect(action).toContain("requirePermission(");
  expect(action).toContain("name.toLowerCase()==='owner'");
  expect(action).toContain("owner_test_data_reset_execute");
  expect(migration).toContain("r.is_owner=true");
  expect(migration).toContain("p_phrase IS DISTINCT FROM 'RESET '||v_company");
  expect(migration).toContain("p_signature IS DISTINCT FROM v_preview->>'signature'");
  expect(migration).toContain('pg_advisory_xact_lock');
 });
 it('preserves organization, subscriptions, audit and unrelated tenant records',()=>{
  expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  expect(migration).not.toMatch(/\bDROP TABLE\b/i);
  expect(migration).not.toContain('DELETE FROM public.organizations');
  expect(migration).not.toContain('DELETE FROM public.audit_logs');
  expect(migration).not.toContain('DELETE FROM public.organization_memberships');
  expect(migration).toContain("'public.leads'::regclass");
  expect(migration).toContain("'public.projects'::regclass");
  expect(migration).toContain("'public.quotations'::regclass");
  expect(migration).toContain("'public.invoices'::regclass");
  expect(migration).toContain('organization_id=$1');
  expect(migration).toContain("RAISE EXCEPTION 'Deletion blocked by dependent data");
  expect(migration).toContain('organization.test_data_reset');
 });
});
