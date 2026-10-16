import { describe, expect, it } from 'vitest';
import { joinQuotationTerms, splitQuotationTerms } from './quotation-terms-format';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';

const PLAN = '[STAGE_PAYMENT_PLAN]\nAgreement & advance|10.00\nFoundation|40.00\nHandover|50.00\n[/STAGE_PAYMENT_PLAN]';

describe('premium quotation terms sections', () => {
  it('preserves legacy unstructured terms and saved payment milestones', () => {
    const previous = 'Extra floor waterproofing as discussed.\n\n' + PLAN;
    const input = splitQuotationTerms(previous);
    expect(input.additional).toBe('Extra floor waterproofing as discussed.');
    expect(input.paymentPlan).toBe(PLAN);
    const updated = joinQuotationTerms({
      ...input, warranty:'Structural coverage for 10 years',
      inclusions:'Cement, steel and interior wiring',
      exclusions:'Owner supplied fixtures',
    });
    expect(savedStagePaymentPlan(updated)).toEqual([
      { name:'Agreement & advance',percent:10 },
      { name:'Foundation',percent:40 },
      { name:'Handover',percent:50 },
    ]);
    expect(updated).toContain('Exclusions:\nOwner supplied fixtures');
    expect(updated).toContain('Warranty:\nStructural coverage for 10 years');
  });
  it('roundtrips separate quote-specific conditions without duplicating section headings', () => {
    const saved = joinQuotationTerms({
      inclusions:'Tiles and fittings',exclusions:'Borewell',
      warranty:'Structural only',additional:'Client to provide access',paymentPlan:'',
    });
    const parsed = splitQuotationTerms(saved);
    expect(parsed).toEqual({
      inclusions:'Tiles and fittings',exclusions:'Borewell',
      warranty:'Structural only',additional:'Client to provide access',paymentPlan:'',
    });
    expect(joinQuotationTerms(parsed)).toBe(saved);
  });
  it('does not lose a payment schedule when terms are otherwise empty', () => {
    const parts=splitQuotationTerms(PLAN);
    expect(parts.additional).toBe('');
    expect(joinQuotationTerms(parts)).toBe(PLAN);
  });
  it('rejects oversized strings before sending the edit_revision command', () => {
    expect(() => joinQuotationTerms({
      inclusions:'a'.repeat(11000), exclusions:'',warranty:'',additional:'',paymentPlan:'',
    })).toThrow(/10,000/);
  });
});


it('retains legacy introductory text, identifies warranty, and preserves stage markers during edits',()=>{
  const input='Previously agreed site access.\n\nWarranty:\nStructure for ten years\n\n'+
    '[STAGE_PAYMENT_PLAN]\nAdvance|10.00\nRCC|60.00\nHandover|30.00\n[/STAGE_PAYMENT_PLAN]';
  const parts=splitQuotationTerms(input);
  expect(parts.additional).toContain('Previously agreed site access.');
  expect(parts.warranty).toBe('Structure for ten years');
  const persisted=joinQuotationTerms({...parts,exclusions:'External electrical works'});
  const again=splitQuotationTerms(persisted);
  expect(again.paymentPlan).toContain('RCC|60.00');
  expect(again.warranty).toBe('Structure for ten years');
  expect(again.exclusions).toBe('External electrical works');
});
