import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  materialHeadForRequest,
  procurementVsBoq,
  type MaterialOrderInput,
} from './project-material-budget';

const order = (over: Partial<MaterialOrderInput>): MaterialOrderInput => ({
  item: 'Cement',
  status: 'ordered',
  source: 'outside',
  orderAmount: null,
  marketplaceTotal: null,
  marketplaceStatus: '',
  ...over,
});

describe('material spend against the BOQ', () => {
  it('files free-text requests under the BOQ material heads', () => {
    expect(materialHeadForRequest('Fe500D TMT 12 mm (footing mesh)')).toBe(
      'Steel',
    );
    expect(materialHeadForRequest('OPC 53 grade cement for footings')).toBe(
      'Cement',
    );
    expect(materialHeadForRequest('River sand 2 loads')).toBe('Sand');
    expect(materialHeadForRequest('20 mm jelly')).toBe('Aggregate');
    expect(materialHeadForRequest('Karimnagar red bricks')).toBe('Bricks');
    expect(materialHeadForRequest('Vitrified floor tiles 2x2')).toBe(
      'Room flooring tiles',
    );
    expect(materialHeadForRequest('Bathroom wall tiles')).toBe(
      'Bathroom tiles',
    );
    expect(materialHeadForRequest('Havells FR wire 1.5 sq mm')).toBe(
      'Electrical',
    );
    expect(materialHeadForRequest('Astral CPVC pipe 3/4"')).toBe('Plumbing');
    expect(materialHeadForRequest('MS frame scaffolding hire')).toBe(
      'Scaffolding',
    );
    expect(materialHeadForRequest('Shuttering oil')).toBe('Other');
  });

  it('adds marketplace and outside spend and the balance per material', () => {
    const rows = procurementVsBoq(
      [
        { head: 'Steel', quantity: 19547, unit: 'kg', amount: 1300000 },
        { head: 'Cement', quantity: 2400, unit: 'bag', amount: 900000 },
      ],
      [
        order({
          item: 'TMT 12 mm',
          source: 'marketplace',
          status: 'approved',
          marketplaceTotal: 400000,
          marketplaceStatus: 'accepted',
        }),
        order({ item: 'TMT 16 mm', orderAmount: 250000 }),
        order({ item: 'OPC cement', status: 'received', orderAmount: 39000 }),
        order({ item: 'OPC cement', status: 'ordered' }),
        order({ item: 'TMT 8 mm', status: 'rejected', orderAmount: 99999 }),
        order({
          item: 'TMT 10 mm',
          source: 'marketplace',
          status: 'approved',
          marketplaceTotal: 50000,
          marketplaceStatus: 'rejected',
        }),
        order({ item: 'Shuttering oil', orderAmount: 5000 }),
      ],
    );
    expect(rows.find((row) => row.head === 'Steel')).toMatchObject({
      marketplace: 400000,
      outside: 250000,
      ordered: 650000,
      balance: 650000,
    });
    expect(rows.find((row) => row.head === 'Cement')).toMatchObject({
      outside: 39000,
      unpriced: 1,
      balance: 861000,
    });
    expect(rows.find((row) => row.head === 'Other')).toMatchObject({
      boqAmount: 0,
      outside: 5000,
    });
  });

  it('an outside order placed or received earlier can still get its amount', () => {
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(read('./project-v2-view.tsx')).toContain('<MaterialOrderAmountForm');
    expect(read('./project-material-delivery.tsx')).toContain(
      'export function MaterialOrderAmountForm',
    );
    expect(read('./[id]/site/material-delivery-actions.ts')).toContain(
      'export async function saveMaterialOrderAmount',
    );
  });
});
