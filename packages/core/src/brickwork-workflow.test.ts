import { describe, expect, it } from 'vitest';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
} from './company-construction-defaults';
import {
  defaultBrickworkDays,
  defaultBrickworkItems,
} from './brickwork-workflow';

describe('approved 20-step, 30-day Brickwork workflow', () => {
  const brickwork = defaultCompanyConstructionStages.find(
    (stage) => stage.id === 'brickwork',
  );
  const items = defaultBrickworkItems;
  const position = (id: string) => items.findIndex((item) => item.id === id);

  it('has payment first and repeats a 30-day stage for every floor', () => {
    expect(brickwork?.repeatsPerFloor).toBe(true);
    expect(brickwork?.days).toBe(30);
    expect(defaultBrickworkDays).toBe(30);
    expect(brickwork?.items).toEqual(items);
    expect(items.at(0)).toEqual({
      id: 'brickwork-stage-payment',
      kind: 'payment',
      title: 'Brickwork Stage Payment',
      days: 0,
    });
    expect(items).toHaveLength(80);
    expect(items.filter((item) => item.kind === 'material')).toHaveLength(17);
    expect(items.filter((item) => item.kind === 'check')).toHaveLength(48);
    expect(items.filter((item) => item.kind === 'qc')).toHaveLength(2);
  });

  it('preserves all eleven scheduled work activities and distributes 30 days', () => {
    expect(
      items
        .filter((item) => item.days > 0)
        .map((item) => [item.kind, item.title, item.days]),
    ).toEqual([
      ['work', 'Room marking and internal/external wall layout', 2],
      ['work', 'Brickwork up to 3-foot height', 6],
      ['work', 'Door frame positioning and fixing', 2],
      ['work', 'DPC bed / sill-level band, where specified', 2],
      ['work', 'Window opening marking', 1],
      ['work', 'Continue brickwork up to door/lintel level', 5],
      ['work', 'Window sill waterproofing / DPC treatment, where specified', 1],
      ['work', 'Sajja (sunshade/chajja) shuttering and reinforcement', 2],
      ['work', 'Door/window lintel shuttering and reinforcement fixing', 2],
      ['work', 'Lintel and sajja concreting', 2],
      ['work', 'Brickwork from lintel level up to slab soffit', 5],
    ]);
    expect(items.reduce((sum, item) => sum + item.days, 0)).toBe(30);
  });

  it('places individual materials before corresponding work', () => {
    expect(position('bw-bricks-or-blocks')).toBeLessThan(
      position('bw-room-wall-marking'),
    );
    expect(position('bw-door-frames')).toBeLessThan(
      position('bw-door-frame-fixing'),
    );
    expect(position('bw-waterproofing-compound-dpc')).toBeLessThan(
      position('bw-dpc-bed-band'),
    );
    expect(position('bw-lintel-sajja-steel')).toBeLessThan(
      position('bw-sajja-shuttering-rebar'),
    );
    expect(position('bw-lintel-sajja-aggregate')).toBeLessThan(
      position('bw-lintel-sajja-concreting'),
    );
  });

  it('holds lintel/sajja concreting for QC and finishes with final QC', () => {
    expect(position('bw-check-lintel-form-level-support')).toBeLessThan(
      position('bw-qc-lintel-sajja-rebar-form'),
    );
    expect(position('bw-qc-lintel-sajja-rebar-form')).toBeLessThan(
      position('bw-lintel-sajja-concreting'),
    );
    expect(position('bw-check-service-sleeves')).toBeLessThan(
      position('bw-qc-final-brickwork'),
    );
    expect(position('bw-masonry-to-slab-soffit')).toBeLessThan(
      position('bw-qc-final-brickwork'),
    );
    expect(position('bw-qc-final-brickwork')).toBeLessThan(
      position('bw-daily-curing-inspection-log'),
    );
  });

  it('keeps DPC treatments conditional and records curing without adding a work day', () => {
    const mainDpc = items.find((item) => item.id === 'bw-dpc-bed-band');
    const sillDpc = items.find(
      (item) => item.id === 'bw-window-sill-treatment',
    );
    expect(mainDpc?.guideText).toContain('Do not duplicate');
    expect(sillDpc?.guideText).toContain('approved design');
    const log = items.at(-1);
    expect(log).toMatchObject({
      id: 'bw-daily-curing-inspection-log',
      kind: 'work',
      days: 0,
      title: 'Brickwork curing and daily site inspection records',
    });
    expect(log?.guideText).toContain('existing Daily Curing');
    expect(log?.guideText).toContain('30 scheduled working days');
  });

  it('is schema-valid with distinct item IDs and inspection labels', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(
      new Set(items.map((item) => item.kind + ':' + item.title.toLowerCase()))
        .size,
    ).toBe(items.length);
    expect(items.every((item) => item.title.length <= 180)).toBe(true);
    expect(
      companyConstructionStages.safeParse(defaultCompanyConstructionStages)
        .success,
    ).toBe(true);
  });
});
