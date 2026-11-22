import { describe, expect, it } from 'vitest';
import { normalizeDesign } from '@business-os/core/construction-boq';
import { structuralDesignSchema } from './boq-structural-design-schema';

describe('saved BOQ structural drawing persistence', () => {
  it('round-trips all new structural schedules without losing mixed steel or floor associations', () => {
    const input = {
      columns: [
        {
          label: 'C1',
          count: 4,
          floors: 2,
          bars: '4-16+2-12',
          widthIn: 9,
          depthIn: 12,
        },
      ],
      beams: [
        {
          label: 'B1',
          bars: '2-16+2-12',
          runFeet: [60, 80],
          countsByFloor: [3, 4],
          widthIn: 9,
          depthIn: 15,
          stirrupDia: 8,
          stirrupSpacingIn: 6,
        },
      ],
      footings: [
        {
          label: 'F1',
          count: 4,
          reinforcement: [
            { layer: 'bottom', direction: 'length', dia: 16, spacingIn: 6 },
            { layer: 'top', direction: 'width', dia: 12, spacingIn: 8 },
          ],
        },
      ],
      plinthRunFeet: 0,
      plinthBeams: [
        {
          label: 'PB1',
          count: 2,
          lengthFeet: 15,
          widthIn: 9,
          depthIn: 12,
          bars: '4-16+2-12',
          stirrupDia: 8,
          stirrupSpacingIn: 6,
        },
      ],
      slabPanels: [
        {
          label: 'S1',
          floor: 'Ground Floor',
          count: 2,
          lengthFeet: 10,
          widthFeet: 12,
          thicknessIn: 6,
          reinforcement: [
            { layer: 'bottom', direction: 'length', dia: 16, spacingIn: 6 },
            { layer: 'top', direction: 'width', dia: 12, spacingIn: 8 },
          ],
        },
      ],
      staircases: [
        {
          label: 'ST1',
          floor: 'First Floor',
          count: 1,
          widthFeet: 3.5,
          riserIn: 6,
          treadIn: 10,
          waistIn: 6,
          landingFeet: 4,
          reinforcement: [
            { role: 'main', dia: 12, spacingIn: 6 },
            { role: 'distribution', dia: 8, spacingIn: 8 },
          ],
        },
      ],
      settings: { slabThicknessIn: 5 },
    };
    const saved = structuralDesignSchema.parse(input);
    const reopened = structuralDesignSchema.parse(
      JSON.parse(JSON.stringify(saved)),
    );
    expect(reopened).toEqual(input);
    const normalized = normalizeDesign(reopened)!;
    expect(normalized.beams[0]?.countsByFloor).toEqual([3, 4]);
    expect(normalized.plinthBeams?.[0]?.bars).toBe('4-16+2-12');
    expect(normalized.slabPanels?.[0]?.reinforcement).toHaveLength(2);
    expect(normalized.staircases?.[0]?.reinforcement).toHaveLength(2);
    expect(normalized.footings[0]?.reinforcement).toHaveLength(2);
  });

  it('continues to accept old structural BOQs without newly added fields', () => {
    const previous = {
      footings: [],
      columns: [],
      beams: [],
      plinthRunFeet: 60,
      settings: { plinthBeamWidthIn: 9 },
    };
    expect(structuralDesignSchema.parse(previous)).toEqual(previous);
    expect(
      normalizeDesign(structuralDesignSchema.parse(previous))?.plinthRunFeet,
    ).toBe(60);
  });

  it('rejects excessively large schedules before saving', () => {
    expect(
      structuralDesignSchema.safeParse({
        footings: [],
        columns: [],
        beams: [],
        plinthRunFeet: 0,
        slabPanels: Array.from({ length: 101 }, (_, i) => ({ label: 'S' + i })),
      }).success,
    ).toBe(false);
  });
});
