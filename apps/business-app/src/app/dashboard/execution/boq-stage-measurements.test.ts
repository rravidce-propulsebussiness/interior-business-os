import { describe, expect, it } from 'vitest';
import { normalizeStructuralSettings } from '@business-os/core/construction-boq';
import {
  FEET_PER_METRE,
  measuredOutputs,
  measuredVolume,
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

  it('keeps sajjas and shelves site-mixed with no ready-mix or fabricated steel', () => {
    const dimensions = {
      count: 2,
      lengthFeet: 3,
      widthFeet: 2,
      depthFeet: 0.5,
    };
    for (const kind of ['sajjas', 'shelves'] as const) {
      const outputs = measuredOutputs(kind, dimensions, settings);
      expect(outputs.some((item) => item.material === 'concrete_m20')).toBe(false);
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
