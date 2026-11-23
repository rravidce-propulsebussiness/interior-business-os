import { describe, expect, it } from 'vitest';
import {
  calculateBoqProjectCosts,
  DEFAULT_BOQ_PROJECT_COSTS,
  normalizeBoqProjectCosts,
} from './boq-project-costs';

describe('BOQ direct costs and project-wide expenses', () => {
  it('adds indirect costs and contingency once to the measured project cost', () => {
    const costs = normalizeBoqProjectCosts({
      logistics: 50000,
      siteStaff: 100000,
      equipment: 50000,
      contingencyPercent: 5,
      taxes: 30000,
    });
    const result = calculateBoqProjectCosts(3000000, 1500000, costs);
    expect(result.directMaterials).toBe(3000000);
    expect(result.directLabour).toBe(1500000);
    expect(result.siteOverheads).toBe(200000);
    expect(result.contingency).toBe(235000);
    expect(result.taxes).toBe(30000);
    expect(result.projectWideCost).toBe(465000);
    expect(result.total).toBe(4965000);
  });

  it('does not invent percentages or expenses when no rates were supplied', () => {
    const result = calculateBoqProjectCosts(
      3500000,
      1500000,
      DEFAULT_BOQ_PROJECT_COSTS,
    );
    expect(result.total).toBe(5000000);
    expect(result.projectWideCost).toBe(0);
  });

  it('normalizes non-finite and negative values for saved legacy documents', () => {
    const result = normalizeBoqProjectCosts({
      logistics: -1,
      equipment: Number.NaN,
      contingencyPercent: 500,
      taxes: 100,
    });
    expect(result.logistics).toBe(0);
    expect(result.equipment).toBe(0);
    expect(result.contingencyPercent).toBe(100);
    expect(result.taxes).toBe(100);
  });
});
