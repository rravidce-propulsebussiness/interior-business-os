import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildFloorPricing,
  BoqFinalFloorPricing,
} from './boq-final-floor-pricing';

describe('one final BOQ floor-wise pricing', () => {
  const floors = [
    { name: 'Ground Floor', areaSqft: 1000 },
    { name: 'First Floor', areaSqft: 950 },
  ];

  it('shows costs by floor without charging allocated composite labour twice', () => {
    const rows = buildFloorPricing(
      [
        { stage: 'Foundation', amount: 10000, isLabour: false },
        { stage: 'Ground Floor', amount: 20000, isLabour: false },
        { stage: 'First Floor', amount: 25000, isLabour: false },
      ],
      { 'Ground Floor': 10000, 'First Floor': 9500 },
      floors,
      ['Foundation', 'Ground Floor', 'First Floor'],
    );
    expect(rows.map((r) => r.stage)).toEqual([
      'Foundation',
      'Ground Floor',
      'First Floor',
    ]);
    expect(rows.find((r) => r.stage === 'Ground Floor')).toMatchObject({
      areaSqft: 1000,
      materialCost: 20000,
      labourCost: 10000,
      totalCost: 30000,
      costPerSqft: 30,
    });
    expect(rows.find((r) => r.stage === 'First Floor')).toMatchObject({
      areaSqft: 950,
      materialCost: 25000,
      labourCost: 9500,
      totalCost: 34500,
    });
    expect(rows.find((r) => r.stage === 'Foundation')).toMatchObject({
      areaSqft: null,
      labourCost: 0,
      totalCost: 10000,
      costPerSqft: null,
    });
    expect(rows.reduce((total, r) => total + r.totalCost, 0)).toBe(74500);
  });

  it('counts legacy labour only once, separately from materials', () => {
    const rows = buildFloorPricing(
      [
        { stage: 'Ground Floor', amount: 5000, isLabour: false },
        { stage: 'Ground Floor', amount: 1500, isLabour: true },
      ],
      {},
      floors,
      ['Ground Floor'],
    );
    expect(rows[0]).toMatchObject({
      materialCost: 5000,
      labourCost: 1500,
      totalCost: 6500,
    });
    expect(rows[1]).toMatchObject({
      materialCost: 0,
      labourCost: 0,
    });
  });

  it('keeps general daily labour visible without fabricating a floor area', () => {
    const rows = buildFloorPricing([], { General: 2400 }, floors, []);
    expect(rows.find((r) => r.stage === 'General')).toMatchObject({
      areaSqft: null,
      materialCost: 0,
      labourCost: 2400,
      totalCost: 2400,
    });
  });

  it('keeps project-wide expenses separate from materials and labour', () => {
    const rows = buildFloorPricing(
      [
        { stage: 'Ground Floor', amount: 100000, isLabour: false },
        { stage: 'Ground Floor', amount: 30000, isLabour: true },
        {
          stage: 'Project-wide costs',
          amount: 12000,
          isLabour: false,
          isOverhead: true,
        },
      ],
      {},
      floors,
      ['Ground Floor', 'Project-wide costs'],
    );
    expect(rows.find((row) => row.stage === 'Ground Floor')).toMatchObject({
      materialCost: 100000,
      labourCost: 30000,
      overheadCost: 0,
      totalCost: 130000,
    });
    expect(
      rows.find((row) => row.stage === 'Project-wide costs'),
    ).toMatchObject({
      materialCost: 0,
      labourCost: 0,
      overheadCost: 12000,
      totalCost: 12000,
    });
    expect(rows.reduce((total, row) => total + row.totalCost, 0)).toBe(142000);
  });

  it('expands a single floor report into itemized measurements and allocated labour', () => {
    const rows = buildFloorPricing(
      [{ stage: 'Ground Floor', amount: 2000, isLabour: false }],
      { 'Ground Floor': 500 },
      floors,
      ['Ground Floor'],
    );
    const render = (canViewCost: boolean) =>
      renderToStaticMarkup(
        createElement(BoqFinalFloorPricing, {
          rows,
          lines: [
            {
              id: 'col-1',
              stage: 'Ground Floor',
              work: 'C1 columns',
              name: 'M20 concrete',
              quantity: 2,
              unit: 'm³',
              rate: 1000,
            },
          ],
          labourAllocations: { 'Ground Floor': 500 },
          materialCost: 2000,
          labourCost: 500,
          totalCost: 2500,
          areaSqft: 1950,
          canViewCost,
        }),
      );
    const html = render(true);
    expect(html).toContain('View detailed quantities and rates');
    expect(html).toContain('C1 columns');
    expect(html).toContain('M20 concrete');
    expect(html).toContain('Allocated labour');
    expect(html).toContain('₹2,500');
    expect((html.match(/boq-floor-cost/g) ?? []).length).toBe(rows.length);
    expect(render(false)).not.toContain('₹2,500');
    expect(render(false)).not.toContain('₹1,000');
    expect(render(false)).not.toContain('Allocated labour');
  });

  it('renders final totals but hides costs from users without cost permissions', () => {
    const rows = buildFloorPricing(
      [{ stage: 'Ground Floor', amount: 1200, isLabour: false }],
      {},
      floors,
      ['Ground Floor'],
    );
    const render = (canViewCost: boolean) =>
      renderToStaticMarkup(
        createElement(BoqFinalFloorPricing, {
          rows,
          materialCost: 1200,
          labourCost: 0,
          totalCost: 1200,
          areaSqft: 1950,
          canViewCost,
        }),
      );
    expect(render(true)).toContain('Floor-wise BOQ pricing');
    expect(render(true)).not.toContain('Project expenses');
    expect(render(true)).toContain('Materials');
    expect(render(true)).toContain('Labour');
    expect(render(true)).toContain('Total project');
    expect(render(true)).toContain('₹1,200');
    expect(render(false)).toContain('Ground Floor');
    expect(render(false)).not.toContain('₹1,200');
  });
});
