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
