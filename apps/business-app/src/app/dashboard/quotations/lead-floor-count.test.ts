import { describe, expect, it } from 'vitest';
import { quoteFloorsFromLead, leadFloorLabel } from './lead-floor-count';
describe('lead floors to quotation editor', () => {
  it('maps old and new construction lead selections', () => {
    expect(quoteFloorsFromLead({ floors: 'ground' })).toBe(1);
    expect(quoteFloorsFromLead({ floors: 'g1' })).toBe(2);
    expect(quoteFloorsFromLead({ floors: 'g2' })).toBe(3);
    expect(quoteFloorsFromLead({ floors: 'g3plus' })).toBe(4);
    expect(quoteFloorsFromLead({floors:'G+2'})).toBe(3);
  });
  it('does not guess floors for unclassified or interior requirements', () => {
    expect(quoteFloorsFromLead({ bhk: '3bhk' })).toBeNull();
    expect(quoteFloorsFromLead({ floors: 'invalid' })).toBeNull();
    expect(leadFloorLabel(4)).toContain('editable');
  });
});