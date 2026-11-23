import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LABOUR,
  LEGACY_CIVIL_LABOUR_MATERIALS,
  evaluateLabour,
  isExtraAllowed,
  isEmbeddedLabourCovered,
  labourMeasurements,
  measuredLabourQuantity,
  type LabourConfig,
  type LabourExtra,
  type LabourLine,
} from './boq-labour';

const lines: LabourLine[] = [
  {
    id: 'columns-1',
    name: 'C1 columns',
    section: 'Ground Floor',
    kind: 'quote-columns',
    inputs: { count: 5, width: 1, depth: 1, height: 10 },
    outputs: [
      {
        name: 'Column shuttering',
        material: 'shuttering',
        quantity: 200,
        unit: 'sqft',
      },
      {
        name: 'M20 concrete',
        material: 'concrete_m20',
        quantity: 1.42,
        unit: 'm³',
      },
      {
        name: '16 mm TMT',
        material: 'steel',
        quantity: 6,
        unit: 'rod',
        weightKg: 45,
      },
    ],
  },
  {
    id: 'walls-1',
    name: 'Wall schedule',
    section: 'Ground Floor',
    kind: 'quote-masonry',
    inputs: {},
    outputs: [
      { name: '9 in external wall', quantity: 500, unit: 'sqft' },
      { name: 'Internal plaster', quantity: 1100, unit: 'sqft' },
    ],
  },
  {
    id: 'exc-1',
    name: 'Excavation',
    section: 'Foundation',
    kind: 'measured-geometry',
    inputs: { stageCategory: 'excavation' },
    outputs: [
      {
        name: 'Excavation (measured)',
        material: 'excavation',
        quantity: 12,
        unit: 'm³',
      },
    ],
  },
];
const floors = [{ name: 'Ground Floor', areaSqft: 1000 }];
const clone = (): LabourConfig => ({
  ...DEFAULT_LABOUR,
  coveredWorks: [...DEFAULT_LABOUR.coveredWorks],
  itemRates: {},
  dailyRates: [...DEFAULT_LABOUR.dailyRates],
  extras: [],
});
const extra = (patch: Partial<LabourExtra>): LabourExtra => ({
  id: 'labour-extra-1',
  name: 'Extra work',
  stage: 'Foundation',
  work: 'excavation',
  method: 'itemwise',
  unit: 'm³',
  quantity: 10,
  quantitySource: 'manual',
  rate: 150,
  workers: 1,
  days: 1,
  outsideScope: false,
  ...patch,
});

describe('BOQ labour costing', () => {
  it('reads shuttering sft, concrete m³ and steel kg independently from the existing BOQ', () => {
    const measured = labourMeasurements(lines);
    expect(
      measuredLabourQuantity(measured, 'shuttering', 'Ground Floor', 'sft'),
    ).toBe(200);
    expect(
      measuredLabourQuantity(measured, 'concreting', 'Ground Floor', 'm³'),
    ).toBe(1.42);
    expect(
      measuredLabourQuantity(measured, 'bar-bending', 'Ground Floor', 'kg'),
    ).toBe(45);
    expect(
      measuredLabourQuantity(measured, 'brickwork', 'Ground Floor', 'sft'),
    ).toBe(500);
    expect(
      measuredLabourQuantity(measured, 'plastering', 'Ground Floor', 'sft'),
    ).toBe(1100);
  });

  it('charges the ₹400/sft package once rather than multiplying by eight covered works', () => {
    const estimate = evaluateLabour(clone(), floors, labourMeasurements(lines));
    expect(estimate.base).toBe(400000);
    expect(estimate.extras).toBe(0);
    expect(estimate.total).toBe(400000);
    expect(Object.values(estimate.byStage).reduce((a, b) => a + b, 0)).toBe(
      400000,
    );
  });

  it('adds excluded measured labour and preserves original package price', () => {
    const config = clone();
    config.extras = [extra({ quantitySource: 'boq', quantity: 0 })];
    const estimate = evaluateLabour(config, floors, labourMeasurements(lines));
    expect(estimate.base).toBe(400000);
    expect(estimate.extras).toBe(1800);
    expect(estimate.total).toBe(401800);
  });

  it('blocks another charge on an included work unless it is explicitly outside package scope', () => {
    const config = clone();
    const duplicate = extra({
      work: 'shuttering',
      stage: 'Ground Floor',
      unit: 'sft',
      quantity: 200,
      rate: 50,
    });
    expect(isExtraAllowed(config, duplicate)).toBe(false);
    config.extras = [duplicate];
    expect(
      evaluateLabour(config, floors, labourMeasurements(lines)).invalidExtras,
    ).toEqual([duplicate.id]);
    const extension = { ...duplicate, outsideScope: true, quantity: 40 };
    expect(isExtraAllowed(config, extension)).toBe(true);
    config.extras = [extension];
    expect(
      evaluateLabour(config, floors, labourMeasurements(lines)).total,
    ).toBe(402000);
  });

  it('supports daily estimates for excluded extra work without changing package coverage', () => {
    const config = clone();
    config.extras = [
      extra({ method: 'daily', workers: 3, days: 2, rate: 900 }),
    ];
    expect(
      evaluateLabour(config, floors, labourMeasurements(lines)).total,
    ).toBe(405400);
  });

  it('keeps agreed composite area independent of geometric takeoff and allocates it once', () => {
    const config = clone();
    config.areaOverrideSqft = 1060;
    const estimate = evaluateLabour(config, floors, []);
    expect(estimate.total).toBe(424000);
    expect(estimate.byStage['Ground Floor']).toBe(424000);
  });

  it('can estimate work-wise labour without using the old structural-labour rate on top', () => {
    const config = clone();
    config.method = 'itemwise';
    config.itemRates = { shuttering: 50, concreting: 1000 };
    const estimate = evaluateLabour(config, floors, labourMeasurements(lines));
    expect(estimate.total).toBe(11420);
    expect(LEGACY_CIVIL_LABOUR_MATERIALS.has('labour_civil')).toBe(true);
  });

  it('returns no new labour charges for older saved BOQs with no config', () => {
    expect(evaluateLabour(null, floors, labourMeasurements(lines)).total).toBe(
      0,
    );
  });
  it('keeps separate trades and excavation outside the default civil contract', () => {
    const config = clone();
    expect(isEmbeddedLabourCovered('labour_civil', config)).toBe(true);
    expect(isEmbeddedLabourCovered('shuttering', config)).toBe(true);
    expect(isEmbeddedLabourCovered('plaster_labour', config)).toBe(true);
    expect(isEmbeddedLabourCovered('labour_tiling', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_painting', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_electrical', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_plumbing', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_door_fixing', config)).toBe(false);
    expect(isEmbeddedLabourCovered('excavation', config)).toBe(false);
    expect(isEmbeddedLabourCovered('soil_filling', config)).toBe(false);
  });

  it('replaces a separate trade only when its labour is expressly covered', () => {
    const config = clone();
    config.coveredWorks.push('tiling');
    expect(isEmbeddedLabourCovered('labour_tiling', config)).toBe(true);
    config.method = 'itemwise';
    config.itemRates = { painting: 25 };
    expect(isEmbeddedLabourCovered('labour_tiling', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_painting', config)).toBe(true);
    expect(isEmbeddedLabourCovered('labour_plumbing', config)).toBe(false);
    expect(isEmbeddedLabourCovered('labour_painting', null)).toBe(false);
  });

});
