import { describe, expect, it } from 'vitest';
import {
  defaultConstructionWorkflow,
  expandConstructionStages,
  validateConstructionTemplate,
} from './construction-workflow';

const floors = [
  { code: 'GROUND', name: 'Ground floor' },
  { code: 'FIRST', name: 'First floor' },
  { code: 'SECOND', name: 'Second floor' },
  { code: 'TERRACE', name: 'Terrace level' },
];

describe('construction workflow blueprint', () => {
  it('contains all major construction phases without invented quantities or thresholds', () => {
    const template = validateConstructionTemplate(defaultConstructionWorkflow);
    expect(new Set(template.stages.map((stage) => stage.phase)).size).toBe(9);
    expect(
      template.stages.find((stage) => stage.code === 'FOUNDATION')?.holdPoint,
    ).toBe('structural');
    expect(
      template.stages.find((stage) => stage.code === 'HANDOVER')?.holdPoint,
    ).toBe('handover');
    expect(JSON.stringify(template)).not.toMatch(
      /curing_days|minimum_mpa|paid_amount|completion_percentage/,
    );
  });

  it('orders design, foundation and plinth work as the owner requested', () => {
    const stages = defaultConstructionWorkflow.stages;
    const design = stages.find((stage) => stage.code === 'DESIGN')!;
    const foundation = stages.find((stage) => stage.code === 'FOUNDATION')!;
    const plinth = stages.find((stage) => stage.code === 'PLINTH')!;
    const at = (items: string[], pattern: RegExp) =>
      items.findIndex((item) => pattern.test(item));

    expect(at(design.activities, /floor plan/i)).toBeLessThan(
      at(design.activities, /structural drawings/i),
    );
    expect(at(design.activities, /structural drawings/i)).toBeLessThan(
      at(design.activities, /electrical and plumbing.*MEP/i),
    );
    expect(at(foundation.activities, /PCC below footings/i)).toBeLessThan(
      at(foundation.activities, /Column reinforcement/i),
    );
    expect(at(plinth.activities, /Backfill/i)).toBeLessThan(
      at(plinth.activities, /Plinth beam reinforcement/i),
    );
    expect(at(plinth.activities, /Anti-termite/i)).toBeGreaterThan(
      at(plinth.activities, /Final soil leveling/i),
    );
    const sitePrep = stages.find((stage) => stage.code === 'SITE_PREP')!;
    expect(sitePrep.explanation).toContain('15–20 days');
    expect(sitePrep.holdPoint).toBeNull();
    expect(sitePrep.inspectionTopics).toEqual([
      'Column marking aligns with the approved structural design',
      'Excavation depth matches the approved design',
      'Excavation length matches the approved drawings',
      'Excavation width matches the approved drawings',
      'Soil sample sent to the testing laboratory',
    ]);
    expect(
      stages.find((stage) => stage.code === 'DESIGN')?.inspectionTopics,
    ).toEqual([]);
  });

  it('sequences the floor RCC cycle through columns, staircase and slab work', () => {
    const rcc = defaultConstructionWorkflow.stages.find(
      (stage) => stage.code === 'RCC',
    )!;
    const at = (pattern: RegExp) =>
      rcc.activities.findIndex((item) => pattern.test(item));

    expect(at(/column marking/i)).toBeLessThan(
      at(/column steel.*procurement/i),
    );
    expect(at(/procurement/i)).toBeLessThan(at(/bar cutting, bending/i));
    expect(at(/bar cutting, bending/i)).toBeLessThan(
      at(/engineer site check of column/i),
    );
    expect(at(/column concreting/i)).toBeLessThan(at(/staircase shuttering/i));
    expect(at(/staircase concreting/i)).toBeLessThan(
      at(/staircase column rise/i),
    );
    expect(at(/staircase column rise/i)).toBeLessThan(
      at(/beam and slab shuttering/i),
    );
    expect(at(/beam and slab shuttering/i)).toBeLessThan(
      at(/slab and beam reinforcement/i),
    );
    expect(at(/pre-pour site check/i)).toBeLessThan(
      at(/beam and slab concreting/i),
    );
    expect(rcc.inspectionTopics).toHaveLength(3);
  });

  it('expands an arbitrary floor list and respects cross-floor structural gates', () => {
    const stages = expandConstructionStages(
      defaultConstructionWorkflow,
      floors,
    );
    const rcc = stages.find((stage) => stage.instanceCode === 'RCC/SECOND');
    const masonry = stages.find(
      (stage) => stage.instanceCode === 'MASONRY/FIRST',
    );
    const handover = stages.find((stage) => stage.instanceCode === 'HANDOVER');
    expect(rcc?.dependsOn).toEqual(['PLINTH', 'RCC/FIRST']);
    expect(masonry?.dependsOn).toEqual(['RCC/FIRST']);
    expect(masonry?.dependsOn).not.toContain('RCC/TERRACE');
    expect(handover?.dependsOn).toEqual(
      floors.map(({ code }) => 'FINISHES/' + code),
    );
    expect(stages.filter((stage) => stage.templateCode === 'RCC')).toHaveLength(
      4,
    );
    expect(stages.every((stage) => stage.floorCode !== 'THIRD')).toBe(true);
  });

  it('adapts to a single floor without guessing upper floors', () => {
    const stages = expandConstructionStages(defaultConstructionWorkflow, [
      { code: 'BASEMENT_2', name: 'Second basement' },
    ]);
    expect(
      stages.find((stage) => stage.instanceCode === 'RCC/BASEMENT_2')
        ?.dependsOn,
    ).toEqual(['PLINTH']);
    expect(
      stages.find((stage) => stage.instanceCode === 'HANDOVER')?.dependsOn,
    ).toEqual(['FINISHES/BASEMENT_2']);
  });

  it('rejects duplicate floor and stage codes, unresolved dependencies and cycles', () => {
    expect(() =>
      expandConstructionStages(defaultConstructionWorkflow, [
        floors[0],
        floors[0],
      ]),
    ).toThrow('Duplicate floor code');
    expect(() =>
      validateConstructionTemplate({
        ...defaultConstructionWorkflow,
        stages: [
          ...defaultConstructionWorkflow.stages,
          defaultConstructionWorkflow.stages[0],
        ],
      }),
    ).toThrow('Duplicate stage code');
    const invalid = structuredClone(defaultConstructionWorkflow);
    invalid.stages[0]!.dependsOn.push('UNREGISTERED');
    expect(() => validateConstructionTemplate(invalid)).toThrow(
      'Unknown stage dependency',
    );
    const cycle = structuredClone(defaultConstructionWorkflow);
    cycle.stages[0]!.dependsOn.push('HANDOVER');
    expect(() => validateConstructionTemplate(cycle)).toThrow(
      'Circular stage dependency',
    );
  });

  it('does not encode completion, payment, or inspector approval as a blueprint result', () => {
    const [stage] = expandConstructionStages(defaultConstructionWorkflow, [
      floors[0],
    ]);
    expect(stage).not.toHaveProperty('completionPercentage');
    expect(stage).not.toHaveProperty('certified');
    expect(stage).not.toHaveProperty('paid');
    expect(stage?.holdPoint).toBe('contract');
  });
});
