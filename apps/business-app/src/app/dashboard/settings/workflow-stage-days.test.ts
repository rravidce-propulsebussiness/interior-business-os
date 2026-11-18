import { describe, expect, it } from 'vitest';
import type {
  CompanyConstructionStage,
  CompanyStageItem,
} from '@business-os/core/company-construction-defaults';
import {
  scheduledStageItemDays,
  stageWithUpdatedItems,
} from './workflow-stage-days';

const configuredStage: CompanyConstructionStage = {
  id: 'design',
  name: 'Pre-Construction',
  days: 15,
  repeatsPerFloor: false,
  items: [
    {
      id: 'payment-design',
      kind: 'payment',
      title: 'Design and Agreement Payment',
      days: 0,
    },
    { id: 'design-floor-plan', kind: 'design', title: 'Floor Plan', days: 7 },
    {
      id: 'design-structural',
      kind: 'design',
      title: 'Structural Plan',
      days: 3,
    },
    { id: 'design-elevation', kind: 'design', title: 'Elevation', days: 7 },
    { id: 'design-mep', kind: 'design', title: 'MEP Plans', days: 7 },
  ],
};

describe('workflow stage duration synchronization', () => {
  it('adds scheduled item days without counting payments', () => {
    expect(scheduledStageItemDays(configuredStage.items)).toBe(24);
    const updated = stageWithUpdatedItems(
      configuredStage,
      [...configuredStage.items],
      true,
    );
    expect(updated.days).toBe(24);
    expect(updated.name).toBe('Pre-Construction');
    expect(updated.id).toBe('design');
    expect(updated.items).toEqual(configuredStage.items);
  });

  it('updates stage duration immediately when work days increase or decrease', () => {
    const items = configuredStage.items.map((item) =>
      item.id === 'design-floor-plan' ? { ...item, days: 9 } : item,
    );
    const increased = stageWithUpdatedItems(configuredStage, items, true);
    expect(increased.days).toBe(26);

    const decreased = stageWithUpdatedItems(
      increased,
      increased.items.map((item) =>
        item.id === 'design-mep' ? { ...item, days: 2 } : item,
      ),
      true,
    );
    expect(decreased.days).toBe(21);
  });

  it('does not overwrite manual stage days on item rename or reorder', () => {
    expect(
      stageWithUpdatedItems(
        configuredStage,
        [...configuredStage.items].reverse(),
      ).days,
    ).toBe(15);
    const renamed = configuredStage.items.map((item) =>
      item.id === 'design-floor-plan'
        ? { ...item, title: 'Floor Layout' }
        : item,
    );
    expect(stageWithUpdatedItems(configuredStage, renamed).days).toBe(15);
  });

  it('resynchronizes days on work item addition or removal', () => {
    const newItem: CompanyStageItem = {
      id: 'design-3d-view',
      kind: 'design',
      title: '3D View',
      days: 2,
    };
    expect(
      stageWithUpdatedItems(configuredStage, [
        ...configuredStage.items,
        newItem,
      ]).days,
    ).toBe(26);
    expect(
      stageWithUpdatedItems(
        configuredStage,
        configuredStage.items.filter((item) => item.id !== 'design-elevation'),
      ).days,
    ).toBe(17);
    expect(
      stageWithUpdatedItems(
        configuredStage,
        configuredStage.items.filter((item) => item.kind === 'payment'),
      ).days,
    ).toBe(0);
  });

  it('preserves manually configured payment-only stages', () => {
    const stage: CompanyConstructionStage = {
      ...configuredStage,
      days: 12,
      items: configuredStage.items.filter((item) => item.kind === 'payment'),
    };
    expect(stageWithUpdatedItems(stage, [...stage.items], true).days).toBe(12);
    expect(
      stageWithUpdatedItems(stage, [
        ...stage.items,
        {
          id: 'payment-extra',
          kind: 'payment',
          title: 'Extra payment',
          days: 0,
        },
      ]).days,
    ).toBe(12);
  });
});
