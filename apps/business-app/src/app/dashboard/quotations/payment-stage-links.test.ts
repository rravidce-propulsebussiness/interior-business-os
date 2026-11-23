import { describe, expect, it } from 'vitest';
import { defaultCompanyConstructionStages } from '@business-os/core/company-construction-defaults';
import { paymentStageCodes } from './payment-stage-links';

const floors = ['Ground Floor', 'First Floor'];
const ids = defaultCompanyConstructionStages.map((stage) => stage.id);

describe('quoted payment milestones link to the project work they pay for', () => {
  it('links plastering payments to plaster work, not to "Custom milestone"', () => {
    expect(
      paymentStageCodes(
        'internal-plastering-shelves',
        'First Floor',
        floors,
        ids,
      ),
    ).toEqual(['INTERNAL_PLASTER/FIRST_FLOOR']);
    expect(
      paymentStageCodes('external-plastering-elevation', '', floors, ids),
    ).toEqual([
      'EXTERNAL_PLASTER/GROUND_FLOOR',
      'EXTERNAL_PLASTER/FIRST_FLOOR',
    ]);
  });
  it('pays Electrical & plumbing on final plumbing/wiring only', () => {
    expect(
      paymentStageCodes('electrical-plumbing', 'Ground Floor', floors, ids),
    ).toEqual(['PLUMBING_PAINT/GROUND_FLOOR']);
  });
  it('keeps the combined link for workflows without plaster stages', () => {
    const legacy = ids.filter((id) => !id.includes('plastering'));
    expect(
      paymentStageCodes('electrical-plumbing', 'Ground Floor', floors, legacy),
    ).toHaveLength(3);
  });
});
