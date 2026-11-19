import { describe, expect, it } from 'vitest';
import {
  brochureTemplateForInterest,
  classifyLeadServiceInterest,
} from './meta-lead-brochure-automation';

describe('Meta lead brochure automation', () => {
  it.each([
    ['Home construction', 'construction'],
    ['I need a new building', 'construction'],
    ['Interior design', 'interiors'],
    ['Furnishing', 'interiors'],
    ['Construction and interiors', 'both'],
    ['Both', 'both'],
    ['', 'unknown'],
    ['Not sure yet', 'unknown'],
  ] as const)('classifies %s as %s', (answer, expected) => {
    expect(classifyLeadServiceInterest(answer)).toBe(expected);
  });

  it('uses one brochure template for a single interest and a carousel otherwise', () => {
    expect(brochureTemplateForInterest('construction')).toBe('service');
    expect(brochureTemplateForInterest('interiors')).toBe('service');
    expect(brochureTemplateForInterest('both')).toBe('carousel');
    expect(brochureTemplateForInterest('unknown')).toBe('carousel');
  });
});
