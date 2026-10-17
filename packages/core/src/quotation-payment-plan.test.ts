import { describe, expect, it } from 'vitest';
import { savedStagePaymentPlan, hasSavedStagePaymentPlan, savedStagePaymentLinks,encodeStagePaymentLinks } from './quotation-payment-plan';

describe('saved stage-wise payment milestones', () => {
  it('returns null for absent or invalid suggested-only plans', () => {
    expect(savedStagePaymentPlan('Warranty / exclusions only')).toBeNull();
    expect(savedStagePaymentPlan('[STAGE_PAYMENT_PLAN]\nAgreement|10\nPlinth|50\n[/STAGE_PAYMENT_PLAN]')).toBeNull();
    expect(savedStagePaymentPlan('[STAGE_PAYMENT_PLAN]\nAgreement|100\nPlinth|1\n[/STAGE_PAYMENT_PLAN]')).toBeNull();
    expect(savedStagePaymentPlan('[STAGE_PAYMENT_PLAN]\nAgreement|not-a-number\n[/STAGE_PAYMENT_PLAN]')).toBeNull();
    expect(hasSavedStagePaymentPlan('')).toBe(false);
  });
  it('reads only a stored, 100%-complete payment plan', () => {
    const terms = 'Scope approved\n\n[STAGE_PAYMENT_PLAN]\nAgreement|10.00\nFoundation|20.00\nHandover|70.00\n[/STAGE_PAYMENT_PLAN]';
    expect(savedStagePaymentPlan(terms)).toEqual([
      { name: 'Agreement', percent: 10 },
      { name: 'Foundation', percent: 20 },
      { name: 'Handover', percent: 70 },
    ]);
    expect(hasSavedStagePaymentPlan(terms)).toBe(true);
  });
});

describe('quote-stage payment mappings',()=>{
 it('persists exact floor associations without changing the customer payment lines',()=>{
  const terms='[STAGE_PAYMENT_PLAN]\\nAdvance|10.00\\n1st slab|90.00\\n[/STAGE_PAYMENT_PLAN]\\n'
   +encodeStagePaymentLinks([['PRECONSTRUCTION'],['RCC/F_1ST_FLOOR']]);
  expect(savedStagePaymentPlan(terms)?.map(row=>row.name)).toEqual(['Advance','1st slab']);
  expect(savedStagePaymentLinks(terms)).toEqual([['PRECONSTRUCTION'],['RCC/F_1ST_FLOOR']]);
 });
 it('reads old payment schedules without requiring stage links',()=>{
  expect(savedStagePaymentLinks('[STAGE_PAYMENT_PLAN]\\nAdvance|100.00\\n[/STAGE_PAYMENT_PLAN]')).toBeNull();
 });
 it('rejects mismatched row count and unexpected stage identifiers',()=>{
  const terms='[STAGE_PAYMENT_PLAN]\\nAdvance|100.00\\n[/STAGE_PAYMENT_PLAN]';
  expect(savedStagePaymentLinks(terms+'\\n[STAGE_PAYMENT_LINKS]\\n[]\\n[/STAGE_PAYMENT_LINKS]')).toBeNull();
  expect(()=>encodeStagePaymentLinks([['unknown.stage']])).toThrow();
 });
});
