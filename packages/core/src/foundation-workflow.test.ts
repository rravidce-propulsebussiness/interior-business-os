import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';
import {
  defaultFoundationDays,
  defaultFoundationWorkItems,
} from './foundation-workflow';

describe('Foundation work sequence', () => {
  const foundation = defaultCompanyConstructionStages.find(
    (stage) => stage.id === 'foundation',
  );

  it('starts with payment and preserves the 18 ordered steps', () => {
    expect(foundation).toBeDefined();
    expect(foundation?.items).toEqual(defaultFoundationWorkItems);
    expect(foundation?.items[0]).toEqual({
      id: 'foundation-payment',
      kind: 'payment',
      title: 'Foundation payment',
      days: 0,
    });
    expect(defaultFoundationWorkItems).toHaveLength(52);
    expect(
      defaultFoundationWorkItems.filter((item) => item.kind === 'work'),
    ).toEqual([
      {
        id: 'fd-site-marking-excavation',
        kind: 'work',
        title: 'Site marking and excavation',
        days: 2,
      },
      {
        id: 'fd-excavation-dressing-pcc',
        kind: 'work',
        title: 'Excavation bed dressing and PCC laying',
        days: 2,
      },
      {
        id: 'fd-footing-column-rebar',
        kind: 'work',
        title:
          'Column marking and reinforcement bar bending for footings and columns',
        days: 3,
      },
      {
        id: 'fd-footing-concreting',
        kind: 'work',
        title: 'Footing concreting',
        days: 1,
      },
      {
        id: 'fd-column-shuttering-concreting',
        kind: 'work',
        title: 'Column shuttering and concreting',
        days: 1,
      },
      {
        id: 'fd-backfilling-leveling',
        kind: 'work',
        title: 'Backfilling and leveling',
        days: 1,
      },
      {
        id: 'fd-granite-plinth-base',
        kind: 'work',
        title: 'Granite masonry base for plinth beam, where specified',
        days: 4,
      },
      {
        id: 'fd-plinth-rebar-bending',
        kind: 'work',
        title: 'Plinth beam reinforcement bar bending',
        days: 2,
      },
      {
        id: 'fd-plinth-shuttering-concreting',
        kind: 'work',
        title: 'Plinth beam shuttering and concreting',
        days: 2,
      },
      {
        id: 'fd-soil-level-compaction',
        kind: 'work',
        title: 'Soil leveling and compaction',
        days: 3,
      },
      {
        id: 'fd-termite-pcc-bed',
        kind: 'work',
        title: 'Anti-termite treatment followed by PCC bed',
        days: 1,
      },
    ]);
  });

  it('keeps material supplies and checks in order, including the QC gates before concrete pours', () => {
    const items = defaultFoundationWorkItems;
    const position = (id: string) => items.findIndex((item) => item.id === id);
    expect(position('fd-40mm-excavation-pcc')).toBeLessThan(
      position('fd-excavation-dressing-pcc'),
    );
    expect(position('fd-steel-footing-columns')).toBeLessThan(
      position('fd-footing-column-rebar'),
    );
    expect(position('fd-qc-footing-reinforcement')).toBeGreaterThan(
      position('fd-check-footing-rebar-spacing'),
    );
    expect(position('fd-qc-footing-reinforcement')).toBeLessThan(
      position('fd-footing-concreting'),
    );
    expect(position('fd-qc-plinth-rebar')).toBeGreaterThan(
      position('fd-check-plinth-rebar-spacing'),
    );
    expect(position('fd-qc-plinth-rebar')).toBeLessThan(
      position('fd-plinth-shuttering-concreting'),
    );
    expect(items.at(-1)?.id).toBe('fd-termite-pcc-bed');
    expect(items.filter((item) => item.kind === 'material')).toHaveLength(18);
    expect(items.filter((item) => item.kind === 'check')).toHaveLength(20);
    expect(items.filter((item) => item.kind === 'qc')).toHaveLength(2);
    expect(items.filter((item) => item.kind === 'payment')).toHaveLength(1);
  });

  it('sums only scheduled working days, with unique IDs and valid company schema', () => {
    const items = defaultFoundationWorkItems;
    expect(
      items
        .filter((item) => item.kind !== 'work')
        .every((item) => item.days === 0),
    ).toBe(true);
    expect(defaultFoundationDays).toBe(22);
    expect(foundation?.days).toBe(22);
    expect(foundation?.repeatsPerFloor).toBe(false);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(
      new Set(items.map((item) => `${item.kind}:${item.title.toLowerCase()}`))
        .size,
    ).toBe(items.length);
    expect(
      companyConstructionStages.safeParse(defaultCompanyConstructionStages)
        .success,
    ).toBe(true);
  });
});
