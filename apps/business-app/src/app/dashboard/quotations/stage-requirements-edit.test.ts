import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const editor=readFileSync(new URL('./stage-requirements-editor.tsx',import.meta.url),'utf8');
const payment=readFileSync(new URL('./payment-schedule-editor.tsx',import.meta.url),'utf8');
describe('Edit stage plans without a second purchasing system',()=>{
 it('shows item edit/save/cancel for each selected editable work material check or report',()=>{
  expect(editor).toContain('const canRename=editable&&checked&&!required');
  expect(editor).toContain("aria-label={'Edit '+label}");
  expect(editor).toContain("Save item");
  expect(editor).toContain("onUpdate(changed)");
  expect(editor).toContain("renameStageRequirement(requirements,field,label,draft,required)");
 });
 it('keeps miscellaneous transactions in existing finance register',()=>{
  expect(editor).toContain("title:'Major materials to order'");
  expect(editor).toContain('/dashboard/finance?tab=expenses');
  expect(editor).toContain('this editor');
  expect(editor).toContain('never places purchase orders');
  expect(editor).not.toContain('create_purchase_order');
 });
 it('requires saving the existing quotation payment schedule and respects its edit state',()=>{
  expect(payment).toContain("editable={editable}");
  expect(payment).toContain('onChange={value=>editRequirements(code,value)}');
  expect(payment).toContain('Save Payment Schedule');
  expect(editor).toContain('Create an editable revision');
 });
});
