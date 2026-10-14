import { describe, expect, it } from 'vitest';
import {
  leadCategoryLabel,
  leadRequirementLabel,
  resolveLeadCategory,
} from './lead-category';

const industries = [
  { id: 'construction-id', key: 'construction' },
  { id: 'interior-id', key: 'interior_design' },
];

describe('lead industry identity', () => {
  it('uses the tenant industry instead of a BHK value in service_type', () => {
    expect(
      resolveLeadCategory(
        { industry_id: 'construction-id', service_type: '3bhk' },
        industries,
      ),
    ).toBe('construction');
    expect(
      resolveLeadCategory(
        { industry_id: 'interior-id', service_type: '3bhk' },
        industries,
      ),
    ).toBe('interior');
  });

  it('supports explicit legacy category values but never guesses from BHK', () => {
    expect(
      resolveLeadCategory({ service_type: '3bhk' }, industries),
    ).toBeNull();
    expect(
      resolveLeadCategory(
        { service_type: '3bhk', requirements: { service: 'interior' } },
        industries,
      ),
    ).toBe('interior');
    expect(
      resolveLeadCategory({ service_type: 'Construction' }, industries),
    ).toBe('construction');
    expect(leadCategoryLabel(null)).toBe('Needs classification');
  });

  it('does not misclassify an unrecognized industry or conflicting category', () => {
    expect(
      resolveLeadCategory(
        { industry_id: 'another-industry', service_type: 'Construction' },
        industries,
      ),
    ).toBeNull();
    expect(
      resolveLeadCategory(
        { service_type: 'Construction', requirements: { service: 'interior' } },
        industries,
      ),
    ).toBeNull();
  });

  it('keeps property size separate from category', () => {
    expect(leadRequirementLabel({ service_type: '3bhk' })).toBe('3 BHK');
    expect(leadRequirementLabel({ project_size: '3_bhk' })).toBe('3 BHK');
    expect(
      leadRequirementLabel({
        project_size: '2000 sq yards',
        requirements: { bhk: '4_bhk' },
      }),
    ).toBe('4 BHK');
    expect(leadRequirementLabel({ service_type: 'Interiors' })).toBe('');
  });
});
