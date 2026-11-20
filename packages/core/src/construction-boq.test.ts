import { describe, expect, it } from 'vitest';
import {
  cutPlan,
  DEFAULT_STRUCTURAL_SETTINGS,
  floorsFromQuote,
  generateQuotationBoq,
  lapFeet,
  normalizeStructuralSettings,
} from './construction-boq';
import { calculateSftEstimate } from './sft-quotation';

const quote = (heights: [string, string] = ['10', '10']) =>
  calculateSftEstimate({
    rows: [
      {
        kind: 'floor',
        name: 'Ground Floor',
        lengthFeet: '30',
        widthFeet: '40',
        heightFeet: heights[0],
        ratePerSqft: '1850',
      },
      {
        kind: 'floor',
        name: 'First Floor',
        lengthFeet: '30',
        widthFeet: '40',
        heightFeet: heights[1],
        ratePerSqft: '1850',
        inheritFromPrevious: true,
      },
      {
        kind: 'additional',
        name: 'Compound wall',
        lengthFeet: '140',
        widthFeet: '1',
        unit: 'running_ft',
        ratePerSqft: '900',
      },
    ],
    materialIds: [],
    sections: [
      {
        title: 'Main door',
        description: 'Teak main door',
        unit: 'door',
        pricingTreatment: 'allowance',
        allowanceValue: '25000',
      },
      {
        title: 'Internal doors',
        description: 'Flush doors',
        brand: 'Greenply',
        unit: 'door',
        pricingTreatment: 'allowance',
        allowanceValue: '10000',
      },
      {
        title: 'Bathroom fittings & plumbing',
        description: 'CP and sanitary',
        unit: 'bathroom',
        pricingTreatment: 'allowance',
        allowanceValue: '45000',
      },
      {
        title: 'Flooring tiles',
        description: 'Vitrified 2x2',
        unit: 'sqft',
        pricingTreatment: 'allowance',
        allowanceValue: '60',
      },
      {
        title: 'Electrical',
        description: 'Copper wiring',
        unit: 'none',
        pricingTreatment: 'included',
      },
    ],
  });

describe('steel cut planning from 40 ft stock bars', () => {
  it('cuts the foundation lift into 2 pieces per bar when it fits', () => {
    const plan = cutPlan(18.5, 40, 40, lapFeet(16, 50), 2);
    expect(plan).toMatchObject({
      piecesPerBar: 2,
      pieceFeet: 20,
      bars: 20,
      adjusted: false,
    });
  });

  it('cuts a 10 ft floor plus 50d lap into 3 pieces per bar', () => {
    // 16 mm × 50 = 800 mm ≈ 2.62 ft lap → 12.62 ft needed, 13.33 ft cut.
    const plan = cutPlan(10 + lapFeet(16, 50), 24, 40, lapFeet(16, 50), 3);
    expect(plan.piecesPerBar).toBe(3);
    expect(plan.bars).toBe(8);
    expect(plan.adjusted).toBe(false);
  });

  it('drops to 2 pieces per bar when floor height + lap no longer fits a third', () => {
    // 11 ft floor + 2.62 ft lap = 13.62 ft > 13.33 ft.
    const plan = cutPlan(11 + lapFeet(16, 50), 24, 40, lapFeet(16, 50), 3);
    expect(plan.piecesPerBar).toBe(2);
    expect(plan.bars).toBe(12);
    expect(plan.adjusted).toBe(true);
  });

  it('splices runs longer than one stock bar with laps', () => {
    const plan = cutPlan(60, 2, 40, 2);
    // Each 60 ft run needs one extra bar overlapping by 2 ft → 62 ft of bar.
    expect(plan.piecesPerBar).toBe(0);
    expect(plan.bars).toBe(Math.ceil((2 * 62) / 40));
  });
});

describe('quotation-driven construction BOQ', () => {
  it('reads floors, dimensions and floor heights from the quotation', () => {
    const floors = floorsFromQuote(quote(['10', '11']));
    expect(floors).toEqual([
      {
        name: 'Ground Floor',
        areaSqft: 1200,
        lengthFeet: 30,
        widthFeet: 40,
        heightFeet: 10,
      },
      {
        name: 'First Floor',
        areaSqft: 1200,
        lengthFeet: 30,
        widthFeet: 40,
        heightFeet: 11,
      },
    ]);
  });

  it('assumes the default floor height and warns when the quote has none', () => {
    const details = calculateSftEstimate({
      rows: [
        {
          kind: 'floor',
          name: 'Ground Floor',
          lengthFeet: '30',
          widthFeet: '40',
          ratePerSqft: '1850',
        },
      ],
      materialIds: [],
    });
    const result = generateQuotationBoq({ details });
    expect(result.floors[0]).toMatchObject({
      heightFeet: 10,
      heightAssumed: true,
    });
    expect(result.warnings.join(' ')).toContain(
      'floor height not on the quotation',
    );
  });

  it('generates foundation, column, slab, masonry and allowance lines', () => {
    const result = generateQuotationBoq({ details: quote() });
    const sections = new Set(result.lines.map((line) => line.section));
    expect(sections).toEqual(
      new Set([
        'Foundation',
        'Structure',
        'Masonry',
        'Finishes & fittings',
        'Additional quoted works',
      ]),
    );
    // 30×40 ft on a 12 ft grid → 4 × 5 = 20 columns.
    const columns = result.lines.find((line) => line.kind === 'quote-columns');
    expect(columns?.inputs.columns).toBe(20);
    // Foundation lift: 20 columns × 4 bars of 16 mm, 2 per 40 ft bar.
    expect(columns?.notes).toContain(
      'Foundation → Ground Floor · 16 mm: 80 pcs',
    );
    expect(columns?.notes).toContain('cut 2/bar @ 20 ft → 40 bars');
    // First floor lift: 10 ft + lap, 3 per bar.
    expect(columns?.notes).toContain('First Floor · 16 mm: 80 pcs');
    expect(columns?.notes).toContain('cut 3/bar @ 13.33 ft → 27 bars');
    const steel16 = columns?.outputs.find((output) => output.diameter === 16);
    expect(steel16?.rods).toBe(67);
    // Whole bars purchased: 67 × 12.19 m × 1.58 kg/m.
    expect(steel16?.quantity).toBeCloseTo(67 * 40 * 0.3048 * (256 / 162), 0);
    expect(result.steel.map((row) => row.diameter)).toEqual([8, 10, 12, 16]);
  });

  it('reduces cuts per bar when a taller floor needs more length', () => {
    const result = generateQuotationBoq({ details: quote(['10', '11']) });
    const columns = result.lines.find((line) => line.kind === 'quote-columns');
    expect(columns?.notes).toContain('First Floor · 16 mm: 80 pcs');
    expect(columns?.notes).toContain('cut 2/bar');
    expect(
      result.warnings.some((w) => w.startsWith('First Floor columns, 16 mm')),
    ).toBe(true);
  });

  it('prices package allowances per door, bathroom and sq ft', () => {
    const result = generateQuotationBoq({
      details: quote(),
      counts: { mainDoors: 1, internalDoors: 12, bathrooms: 5 },
    });
    const allowances = result.lines
      .filter((line) => line.origin === 'quotation-allowance')
      .map((line) => ({
        name: line.name,
        quantity: line.outputs[0]?.quantity,
        unit: line.outputs[0]?.unit,
        rate: line.outputs[0]?.rate,
      }));
    expect(allowances).toEqual([
      { name: 'Main door', quantity: 1, unit: 'door', rate: 25000 },
      {
        name: 'Internal doors · Greenply',
        quantity: 12,
        unit: 'door',
        rate: 10000,
      },
      {
        name: 'Bathroom fittings & plumbing',
        quantity: 5,
        unit: 'bathroom',
        rate: 45000,
      },
      // 85% of 2,400 sqft built-up.
      { name: 'Flooring tiles', quantity: 2040, unit: 'sqft', rate: 60 },
    ]);
  });

  it('keeps additional quoted works as manual lines with their quoted price', () => {
    const result = generateQuotationBoq({ details: quote() });
    const wall = result.lines.find((line) => line.name === 'Compound wall');
    expect(wall).toMatchObject({
      origin: 'quotation-additional',
      quotedPrice: 126000,
    });
  });

  it('normalizes and clamps company settings', () => {
    const settings = normalizeStructuralSettings({
      stockBarFeet: '1000',
      foundationCuts: '2.6',
      lapDiameters: '',
    });
    expect(settings.stockBarFeet).toBe(60);
    expect(settings.foundationCuts).toBe(3);
    expect(settings.lapDiameters).toBe(
      DEFAULT_STRUCTURAL_SETTINGS.lapDiameters,
    );
  });
});
