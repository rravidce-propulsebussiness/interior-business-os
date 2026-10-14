import { describe, expect, it } from 'vitest';
import { leadServiceFromIndustryKey } from './lead-service-options';

describe('company industry mapping for manual CRM leads', () => {
  it('recognizes canonical ProPulse construction and interiors keys', () => {
    expect(leadServiceFromIndustryKey('construction')).toBe('construction');
    expect(leadServiceFromIndustryKey('interior')).toBe('interior');
    expect(leadServiceFromIndustryKey('interiors')).toBe('interior');
    expect(leadServiceFromIndustryKey('interior_design')).toBe('interior');
  });

  it('does not guess services from unrelated or arbitrary industries', () => {
    expect(leadServiceFromIndustryKey('real_estate')).toBeNull();
    expect(leadServiceFromIndustryKey('landscaping')).toBeNull();
    expect(leadServiceFromIndustryKey('')).toBeNull();
  });
});
