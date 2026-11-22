import { describe, expect, it } from 'vitest';
import { normalizeStructuralSettings } from '@business-os/core/construction-boq';
import {
  FEET_PER_METRE,
  measuredOutputs,
  correctSavedSmallConcrete,
  measuredVolume,
  readMeasuredSteelSets,
} from './boq-stage-measurements';

const settings = normalizeStructuralSettings({});

describe('measured BOQ volume geometry', () => {
  it('calculates count × length × width × depth in both cft and m³', () => {
    const dimensions = { count: 2, lengthFeet: 10, widthFeet: 8, depthFeet: 1 };
    expect(measuredVolume(dimensions).cft).toBe(160);
    expect(measuredVolume(dimensions).m3).toBeCloseTo(4.531, 3);
    expect(FEET_PER_METRE).toBeCloseTo(3.28084, 4);
    expect(
      measuredOutputs('excavation', dimensions, settings)[0],
    ).toMatchObject({
      material: 'excavation',
      quantity: 4.531,
      unit: 'm³',
    });
    expect(measuredOutputs('soil', dimensions, settings)[0]?.material).toBe(
      'soil_filling',
    );
  });

  it('measures PCC site-mix without billing concrete volume twice', () => {
    const outputs = measuredOutputs(
      'pcc',
      { count: 1, lengthFeet: 10, widthFeet: 10, depthFeet: 0.5 },
      settings,
    );
    expect(outputs[0]).toMatchObject({ rate: 0, unit: 'm³' });
    expect(
      outputs.find((item) => item.material === 'cement')?.quantity,
    ).toBeGreaterThan(0);
    expect(outputs.find((item) => item.material === 'sand')?.unit).toBe('t');
    expect(outputs.find((item) => item.material === 'aggregate')?.unit).toBe(
      't',
    );
  });

  it('adds explicit multiple rod sizes to a measured sajja without charging RMC twice', () => {
    const outputs = measuredOutputs(
      'sajjas',
      {
        count: 2, lengthFeet: 3, widthFeet: 2, depthFeet: 0.5,
        steelSets: [
          { dia: 12, count: 4, cutLengthFeet: 6 },
          { dia: 8, count: 2, cutLengthFeet: 4 },
        ],
      },
      settings,
    );
    expect(outputs.some((item) => item.material === 'concrete_m20')).toBe(false);
    expect(outputs.find((item) => item.material === 'cement')).toBeTruthy();
    const rods = outputs.filter((item) => item.material === 'steel');
    expect(rods).toHaveLength(2);
    expect(rods.map((row) => row.diameter)).toEqual([12, 8]);
    expect(rods[0]?.unit).toBe('rod');
    expect(rods.every((row) => (row.weightKg ?? 0) > 0)).toBe(true);
    expect(readMeasuredSteelSets(JSON.stringify([
      { dia: 16, count: 3, cutLengthFeet: 7 },
    ]))).toEqual([{ dia: 16, count: 3, cutLengthFeet: 7 }]);
    expect(readMeasuredSteelSets('{broken')).toEqual([]);
    expect(measuredOutputs('shelves', {
      count: 1, lengthFeet: 2, widthFeet: 1, depthFeet: 0.5,
    }, settings).some((item) => item.material === 'steel')).toBe(false);
  });

  it('keeps sajjas and shelves site-mixed with no ready-mix or fabricated steel', () => {
    const dimensions = {
      count: 2,
      lengthFeet: 3,
      widthFeet: 2,
      depthFeet: 0.5,
    };
    for (const kind of ['sajjas', 'shelves'] as const) {
      const outputs = measuredOutputs(kind, dimensions, settings);
      expect(outputs.some((item) => item.material === 'concrete_m20')).toBe(
        false,
      );
      expect(outputs[0]).toMatchObject({ unit: 'm³', rate: 0 });
      for (const material of ['cement', 'sand', 'aggregate', 'shuttering']) {
        expect(outputs.some((item) => item.material === material)).toBe(true);
      }
      expect(outputs.some((item) => item.material === 'steel')).toBe(false);
    }
    expect(
      measuredOutputs('sajjas', { ...dimensions, depthFeet: 0 }, settings),
    ).toEqual([]);
  });
});

describe('legacy nonstructural ready-mix correction', () => {
  it('preserves saved geometry and shuttering rate while replacing the old RMC supply', () => {
    const previous = {
      kind: 'measured-geometry',
      inputs: {
        stageCategory: 'sajjas',
        count: 2,
        lengthFeet: 3,
        widthFeet: 2,
        depthFeet: 0.5,
      },
      outputs: [
        {
          name: 'Sajja concrete (measured)',
          material: 'concrete_m20',
          quantity: 0.17,
          unit: 'm³',
          rate: 5000,
        },
        {
          name: 'Sajja shuttering',
          material: 'shuttering',
          quantity: 24,
          unit: 'sqft',
          rate: 50,
        },
      ],
    };
    const corrected = correctSavedSmallConcrete(previous, settings);
    expect(corrected?.some((row) => row.material === 'concrete_m20')).toBe(
      false,
    );
    expect(
      corrected?.find((row) => row.material === 'cement')?.quantity,
    ).toBeGreaterThan(0);
    expect(corrected?.find((row) => row.material === 'shuttering')?.rate).toBe(
      50,
    );
    expect(corrected?.find((row) => row.unit === 'm³')).toMatchObject({
      rate: 0,
    });
    expect(previous.outputs[0]?.rate).toBe(5000);
  });

  it('does not change structural, PCC or already site-mixed saved outputs', () => {
    for (const stageCategory of ['columns', 'pcc', 'sajjas']) {
      const outputs =
        stageCategory === 'sajjas'
          ? [{ name: 'Cement', material: 'cement', quantity: 3, unit: 'bag' }]
          : [
              {
                name: 'M20 concrete',
                material: 'concrete_m20',
                quantity: 2,
                unit: 'm³',
              },
            ];
      expect(
        correctSavedSmallConcrete(
          {
            kind: 'measured-geometry',
            inputs: {
              stageCategory,
              count: 1,
              lengthFeet: 3,
              widthFeet: 2,
              depthFeet: 0.5,
            },
            outputs,
          },
          settings,
        ),
      ).toBeNull();
    }
  });
});
