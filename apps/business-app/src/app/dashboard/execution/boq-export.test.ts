import { describe, expect, it } from 'vitest';
import {
  boqCsv,
  boqFileName,
  csvCell,
  materialsToOrder,
  MEASURED_WORK_HEAD,
  type BoqExportRow,
} from './boq-export';

const rows: BoqExportRow[] = [
  {
    stage: 'Foundation',
    item: 'Footings',
    name: 'Cement',
    quantity: 40,
    unit: 'bag',
    rate: 390,
    head: 'Cement',
  },
  {
    stage: 'Foundation',
    item: 'Footings',
    name: '12 mm bars',
    quantity: 30,
    unit: 'rod',
    rate: 720,
    head: 'Steel',
    weightKg: 320,
  },
  {
    stage: 'Ground Floor',
    item: 'Slab',
    name: 'Cement',
    quantity: 60,
    unit: 'bag',
    rate: 390,
    head: 'Cement',
  },
  {
    stage: 'Ground Floor',
    item: 'Room tiles',
    name: 'Floor tiles 2×2',
    quantity: 264,
    unit: 'sq ft',
    rate: 50,
    head: 'Room tiles',
    order: '66 boxes of 4',
  },
  {
    stage: 'Ground Floor',
    item: 'Skipped',
    name: 'Nothing',
    quantity: 0,
    unit: 'nos',
    rate: 10,
  },
];

describe('materialsToOrder', () => {
  it('totals each material across stages', () => {
    const list = materialsToOrder(rows);
    const cement = list.find((line) => line.name === 'Cement')!;
    expect(cement.quantity).toBe(100);
    expect(cement.amount).toBe(39000);
    expect(cement.stages).toEqual(['Foundation', 'Ground Floor']);
    expect(list.find((line) => line.name === '12 mm bars')!.weightKg).toBe(320);
    expect(list.some((line) => line.name === 'Nothing')).toBe(false);
    expect(list.map((line) => line.head)).toEqual([
      'Cement',
      'Steel',
      'Room tiles',
    ]);
    expect(
      materialsToOrder(rows, ['Steel', 'Room tiles', 'Cement']).map(
        (line) => line.head,
      ),
    ).toEqual(['Steel', 'Room tiles', 'Cement']);
  });

  it('keeps site-mix concrete reference volume out of procurement totals', () => {
    const list = materialsToOrder([
      {
        stage: 'Ground Floor',
        item: 'Slab',
        name: 'Slab concrete (M20) · volume only',
        quantity: 2,
        unit: 'm³',
        rate: 0,
        head: 'Other',
      },
      {
        stage: 'Ground Floor',
        item: 'Slab',
        name: 'Cement',
        quantity: 16.1,
        unit: 'bag',
        rate: 360,
        head: 'Cement',
      },
    ]);
    expect(list.map((item) => item.name)).toEqual(['Cement']);
    const csv = boqCsv({
      title: 'Site-mix',
      rows: [
        {
          stage: 'Ground Floor',
          item: 'Slab',
          name: 'Slab concrete (M20) · volume only',
          quantity: 2,
          unit: 'm³',
          rate: 0,
          head: 'Other',
        },
        {
          stage: 'Ground Floor',
          item: 'Slab',
          name: 'Cement',
          quantity: 16.1,
          unit: 'bag',
          rate: 360,
          head: 'Cement',
        },
      ],
      includeCost: true,
    });
    expect(csv).toContain('Slab concrete (M20) · volume only,2,m³,0,0');
    expect(csv).toContain('Total cost estimate,5796');
  });

  it('lists unpriced measured work last', () => {
    const list = materialsToOrder([
      {
        stage: 'Ground Floor',
        item: 'Walls',
        name: '9 in external wall',
        quantity: 900,
        unit: 'sqft',
        rate: 0,
        head: 'Other',
      },
      ...rows,
    ]);
    expect(list.at(-1)).toMatchObject({
      name: '9 in external wall',
      head: MEASURED_WORK_HEAD,
    });
  });
});

describe('csvCell', () => {
  it('quotes commas and quotes and neutralises formulas', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('6" pipe')).toBe('"6"" pipe"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(12.345)).toBe('12.35');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('boqCsv', () => {
  it('lists items stage by stage with totals and margin', () => {
    const csv = boqCsv({
      title: 'Villa BOQ',
      project: 'Villa',
      rows,
      includeCost: true,
      quotedValue: 100000,
      builtUpSqft: 1000,
    });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Bill of quantities,Villa BOQ');
    expect(csv).toContain('Foundation,Footings,Cement,40,bag,390,15600,');
    expect(csv).toContain('Foundation total,,,,,,37200');
    expect(csv).toContain('Ground Floor total,,,,,,36600');
    expect(csv).toContain(
      'Ground Floor,Room tiles,Floor tiles 2×2,264,sq ft,50,13200,66 boxes of 4',
    );
    expect(csv).toContain('Total cost estimate,73800');
    expect(csv).toContain('Cost per sq ft,73.8');
    expect(csv).toContain('Margin over cost,26200');
    expect(csv).not.toContain('Nothing');
  });

  it('leaves out rates and amounts without cost access', () => {
    const csv = boqCsv({ title: 'BOQ', rows, includeCost: false });
    expect(csv).toContain('Foundation,Footings,Cement,40,bag,');
    expect(csv).not.toContain('390');
    expect(csv).not.toContain('Total cost estimate');
  });
});

describe('boqFileName', () => {
  it('makes a safe file name', () => {
    expect(boqFileName('Villa · Construction BOQ')).toBe(
      'Villa-Construction-BOQ.csv',
    );
    expect(boqFileName('***')).toBe('BOQ.csv');
  });
});
