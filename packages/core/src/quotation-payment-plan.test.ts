import { describe, expect, it } from 'vitest';
import { savedStagePaymentPlan, hasSavedStagePaymentPlan } from './quotation-payment-plan';

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
