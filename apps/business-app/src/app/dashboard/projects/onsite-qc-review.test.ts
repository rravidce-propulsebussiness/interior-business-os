import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');

describe('On-site company QC inspection',()=>{
 it('lets verified company owner perform QC without assigning a separate QC inspector',()=>{
 const sql=read('../../../../../../packages/database/supabase/migrations/20261022131500_owner_can_do_company_qc.sql');
 const quality=read('../../../../../../packages/database/supabase/migrations/20261022131600_owner_quality_approval.sql');
 const ui=read('./project-onsite-qc-review.tsx');
 const data=read('./project-v2-data.ts');
 expect(sql).toContain("private.site_owner(p_org)");
 expect(sql).toContain("self_review");
 expect(sql).toContain("at least 12 characters");
 expect(quality).toContain("kind=''quality'' and private.site_owner(p_org)");
 expect(quality).toContain("Non-owner cannot certify their own stage");
 expect(ui).toContain("Company owner QC");
 expect(ui).toContain("Owner QC is enabled without assigning another employee");
 expect(ui).toContain("isOwner");
 expect(data).toContain("isOwner:input.is_owner===true");
});
 it('records per-item pass/fail and physical site-visit evidence',()=>{
  const action=read('./[id]/site/onsite-qc-actions.ts');
  const ui=read('./project-onsite-qc-review.tsx');
  expect(ui).toContain('Pass this QC item');
  expect(ui).toContain('Fail — corrective work required');
  expect(ui).toContain('I personally visited the project site');
  expect(ui).toContain('Inspection history');
  expect(action).toContain("p_visited:true");
  expect(action).toContain("if(form.get('onsite')!=='yes')");
  expect(action).toContain("if(!photoId)throw new Error");
 });
 it('keeps an append-only QC record and reopens only the failed site item',()=>{
  const migration=read('../../../../../../packages/database/supabase/migrations/20261022123500_onsite_stage_qc_item_reviews.sql');
  expect(migration).toContain('construction_stage_qc_item_reviews');
  expect(migration).toContain('p_decision=\'failed\'');
  expect(migration).toContain("set status='recheck'");
  expect(migration).toContain("set status='in_progress'");
  expect(migration).toContain("v_existing.status is distinct from 'ready_for_qc'");
  expect(migration).toContain("role.role='quality_inspector'");
  expect(migration).toContain('v_check.checked_by=v_actor');
  expect(migration).toContain("and m.id=p_photo");
 });
 it('does not allow failed QC to unlock successor or stage certification',()=>{
  const guard=read('../../../../../../packages/database/supabase/migrations/20261022123700_stage_qc_failed_item_guards.sql');
  expect(guard).toContain('private.construction_stage_has_open_qc_failures');
  expect(guard).toContain('QC corrections pending: ');
  expect(guard).toContain('QC defects must be corrected and rechecked before stage certification');
 });
 it('assigns a company QC inspector through the existing project team',()=>{
  const role=read('./project-v2-forms.tsx');
  const overview=read('./project-v2-data.ts');
  expect(role).toContain("'quality_inspector'");
  expect(overview).toContain("'construction_stage_qc_item_read'");
  expect(overview).toContain('inspectorAssigned:');
  expect(read('./project-v2-view.tsx')).toContain('<StageOnsiteQcReview');
 });
});
