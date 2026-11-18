import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';
import { defaultSlabDays, defaultSlabWorkItems } from './slab-workflow';

describe('approved 20-step Slabs workflow', () => {
  const slabs = defaultCompanyConstructionStages.find(
    (stage) => stage.id === 'slabs',
  );
  const items = defaultSlabWorkItems;
  const indexOf = (id: string) => items.findIndex((item) => item.id === id);

  it('repeats for every floor with 16 working days and payment first', () => {
    expect(slabs?.repeatsPerFloor).toBe(true);
    expect(slabs?.days).toBe(16);
    expect(defaultSlabDays).toBe(16);
    expect(slabs?.items).toEqual(items);
    expect(items[0]).toEqual({
      id: 'slab-stage-payment',
      kind: 'payment',
      title: 'Slab Stage Payment',
      days: 0,
    });
    expect(items).toHaveLength(87);
    expect(items.filter((item) => item.kind === 'material')).toHaveLength(23);
    expect(items.filter((item) => item.kind === 'check')).toHaveLength(49);
    expect(items.filter((item) => item.kind === 'qc')).toHaveLength(3);
  });

  it('uses the agreed sequence and durations for every scheduled work or QC item', () => {
    expect(items.filter((item) => item.days > 0).map((item) => [
      item.kind,
      item.title,
      item.days,
    ])).toEqual([
      ['work', 'Column marking and starter preparation', 1],
      ['work', 'Column reinforcement bar bending and fixing', 2],
      ['work', 'Column shuttering and concreting', 2],
      ['work', 'Staircase shuttering', 1],
      ['work', 'Staircase reinforcement fixing', 1],
      ['work', 'Staircase concreting', 1],
      ['work', 'Staircase column rise / landing support columns, where specified', 1],
      ['work', 'Slab and beam shuttering', 3],
      ['work', 'Slab and beam reinforcement bar bending and fixing', 2],
      ['qc', 'Final slab and beam reinforcement, shuttering and embedded-services inspection', 1],
      ['work', 'Slab and beam concreting', 1],
    ]);
    expect(items.reduce((total, item) => total + item.days, 0)).toBe(16);
  });

  it('places reinforcement QC after checks and before each concrete pour', () => {
    expect(indexOf('slab-check-column-rebar-alignment')).toBeLessThan(
      indexOf('slab-qc-column-rebar'),
    );
    expect(indexOf('slab-qc-column-rebar')).toBeLessThan(
      indexOf('slab-column-shuttering-concreting'),
    );
    expect(indexOf('slab-check-stair-anchorage')).toBeLessThan(
      indexOf('slab-qc-staircase-rebar-form'),
    );
    expect(indexOf('slab-qc-staircase-rebar-form')).toBeLessThan(
      indexOf('slab-staircase-concreting'),
    );
    expect(indexOf('slab-check-rebar-cover')).toBeLessThan(
      indexOf('slab-qc-final-prepour'),
    );
    expect(indexOf('slab-qc-final-prepour')).toBeLessThan(
      indexOf('slab-beam-concreting'),
    );
  });

  it('preserves material and inspection order, ending with the curing work log', () => {
    expect(indexOf('slab-steel-column-rebar')).toBeLessThan(
      indexOf('slab-column-barbending-fixing'),
    );
    expect(indexOf('slab-staircase-steel')).toBeLessThan(
      indexOf('slab-staircase-rebar-fixing'),
    );
    expect(indexOf('slab-beam-shuttering-plywood')).toBeLessThan(
      indexOf('slab-beam-shuttering'),
    );
    expect(indexOf('slab-beam-concrete-supply')).toBeLessThan(
      indexOf('slab-beam-concreting'),
    );
    const log = items.at(-1);
    expect(log).toMatchObject({
      kind: 'work',
      title: 'Slab curing and daily curing records',
      days: 0,
    });
    expect(log?.guideText).toContain('Work Log');
    expect(log?.guideText).toContain('Daily Curing');
    expect(indexOf('slab-beam-concreting')).toBeLessThan(
      indexOf('slab-curing-daily-log'),
    );
  });

  it('meets stage and programme limits without duplicate names or identifiers', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(
      new Set(items.map((item) => item.kind + ':' + item.title.toLowerCase()))
        .size,
    ).toBe(items.length);
    expect(companyConstructionStages.safeParse(defaultCompanyConstructionStages).success)
      .toBe(true);
    expect(items.every((item) => item.title.length <= 180)).toBe(true);
    expect(items.at(-1)?.guideText?.length).toBeLessThanOrEqual(1800);
  });
});
