import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { costSummaryByHead } from './boq-cost-summary';
import {
  costHead,
  effectiveRates,
  isBoqCostUnpriced,
  rateForOutput,
} from './boq-pricing';
import { editorUnit } from './boq-compact-editor';
import { withMeasuredBindingWire } from './boq-binding-wire';
import { fillingOutput } from './boq-stage-measurements';

describe('material-wise BOQ cost', () => {
  it('totals each material with its purchase quantity, steel in kg', () => {
    const rows = costSummaryByHead([
      {
        head: 'Steel',
        quantity: 100,
        unit: 'rod',
        rate: 725,
        weightKg: 1065.6,
      },
      { head: 'Steel', quantity: 50, unit: 'rod', rate: 1289, weightKg: 947.2 },
      { head: 'Cement', quantity: 300, unit: 'bag', rate: 390 },
      { head: 'Cement', quantity: 120, unit: 'bag', rate: 330 },
      { head: 'Sand', quantity: 40, unit: 't', rate: 1750 },
      { head: 'Electrical', quantity: 10, unit: 'coil', rate: 1900 },
      { head: 'Bricks', quantity: 1000, unit: 'nos', rate: 0 },
    ]);
    expect(rows.map((row) => row.head)).toEqual([
      'Cement',
      'Sand',
      'Steel',
      'Electrical',
    ]);
    expect(rows.find((row) => row.head === 'Steel')).toMatchObject({
      quantity: 2012.8,
      unit: 'kg',
      amount: 100 * 725 + 50 * 1289,
    });
    expect(rows.find((row) => row.head === 'Cement')).toMatchObject({
      quantity: 420,
      unit: 'bag',
    });
    expect(rows.find((row) => row.head === 'Electrical')?.quantity).toBeNull();
  });

  it('prices scaffolding for external plaster under its own head', () => {
    expect(costHead('scaffolding')).toBe('Scaffolding');
    expect(
      rateForOutput(
        {
          name: 'Scaffolding (external plaster)',
          unit: 'sqft',
          material: 'scaffolding',
        },
        effectiveRates([]),
      ),
    ).toBe(10);
  });

  it('prices every cost a house BOQ generates', () => {
    const rates = effectiveRates([]);
    const price = (output: Parameters<typeof rateForOutput>[0]) =>
      rateForOutput(output, rates);
    for (const [name, unit, material] of [
      ['Anti-termite treatment', 'sqft', 'anti_termite'],
      ['Construction water & power', 'sqft', 'site_utilities'],
      ['Water pump', 'each', 'water_pump'],
      ['Earthing pits', 'each', 'earthing'],
      ['Staircase railing (SS)', 'rft', 'railing'],
      ['Building permission & approvals', 'LS', 'building_permission'],
      ['Testing & snag rectification', 'LS', 'handover_snags'],
      ['Soil filling (measured)', 'm³', 'soil_filling'],
      ['Soil filling (measured)', 'm³', 'moorum_filling'],
    ] as const)
      expect(
        isBoqCostUnpriced({ name, unit, material, quantity: 1 }, price),
      ).toBe(false);
    // Saved BOQs: quoted borewell and lift rows without a material key.
    expect(price({ name: 'Borewell', unit: 'LS' })).toBe(150000);
    expect(price({ name: 'Lift', unit: 'each' })).toBe(950000);
  });

  it('prices bought moorum as material and backfill as labour', () => {
    const soil = { name: 'Soil filling (measured)', material: 'soil_filling' };
    expect(
      fillingOutput('Moorum filling inside plinth (2 ft)', soil).material,
    ).toBe('moorum_filling');
    expect(
      fillingOutput('Backfill footing pits F1 above footing', soil).material,
    ).toBe('soil_filling');
    expect(costHead('moorum_filling')).toBe('Excavation');
    expect(costHead('railing')).toBe('Site & services');
  });

  it('saved BOQs regenerate once when the generator adds new lines', () => {
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8');
    const workspace = read('./boq-workspace.tsx');
    expect(workspace).toContain('const BOQ_ENGINE_VERSION = 5;');
    expect(workspace).toContain('engineVersion: BOQ_ENGINE_VERSION,');
    expect(workspace).toContain(
      '(generator.engineVersion ?? 1) >= BOQ_ENGINE_VERSION',
    );
    expect(read('./boq-actions.ts')).toContain('engineVersion: z');
  });
});

describe('structural units and binding wire', () => {
  it('converts millimetres back to saved inches', () => {
    const view = editorUnit('in', 'm');
    expect(view.unit).toBe('mm');
    expect(6 * view.factor).toBeCloseTo(152.4);
    expect(304.8 / view.factor).toBeCloseTo(12);
    expect(editorUnit('in', 'ft')).toEqual({ unit: 'in', factor: 1 });
    expect(editorUnit('mm', 'm')).toEqual({ unit: 'mm', factor: 1 });
  });
  it('adds binding wire only once for measured reinforcement', () => {
    const outputs = [
      {
        name: '12 mm TMT',
        material: 'steel',
        quantity: 53,
        unit: 'rod',
        weightKg: 570,
        rods: 53,
      },
    ];
    const result = withMeasuredBindingWire(outputs, 8, 40);
    expect(
      result.find((output) => output.material === 'binding_wire')?.quantity,
    ).toBe(4.6);
    expect(withMeasuredBindingWire(result, 8, 40)).toEqual(result);
  });
});
