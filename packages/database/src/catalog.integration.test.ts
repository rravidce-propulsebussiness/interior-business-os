import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { calculate, catalogSchema } from '@business-os/quotation-engine';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'prices the actual migrated, RLS-filtered Interior seed through the canonical engine',
  () => {
    const result = spawnSync(
      process.env.PSQL_PATH ??
        (process.platform === 'win32'
          ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
          : 'psql'),
      [
        '-X',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        process.env.TEST_DATABASE_URL!,
        '-c',
        "begin; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; select public.catalog_snapshot('dddddddd-dddd-4ddd-8ddd-dddddddddddd',true); rollback;",
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(result.stderr || 'Database test failed');
    const line = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('{'));
    const catalog = catalogSchema.parse(JSON.parse(line ?? 'null')),
      item = catalog.items.find((i) => i.key === 'wardrobe')!;
    const input = {
      organization_id: item.organization_id,
      item_id: item.id,
      price_book_id: null,
      branch_id: null,
      currency: 'INR',
      at: '2026-09-29T00:00:00Z',
      measurements: { width: '8', height: '7' },
      answers: {
        grade: 'bwp',
        finish: 'pu',
        hardware: 'hettich',
        shutter: 'hinged',
        pu_finish: 'matte',
      },
    };
    const snapshot = calculate(catalog, input);
    expect(snapshot.calculatedQuantity).toBe('56');
    expect(snapshot.adjustedUnitRate).toBe('2380');
    expect(snapshot.finalCalculatedAmount).toBe('133280');
    expect(snapshot.internal?.estimatedCost).toBe('58800');
    expect(calculate(catalog, input)).toEqual(snapshot);
    const serialized = JSON.stringify(snapshot);
    catalog.rates.find((r) => r.item_id === item.id)!.base_rate = '1650';
    expect(JSON.stringify(snapshot)).toBe(serialized);
    expect(calculate(catalog, input).finalCalculatedAmount).toBe('138880');
  },
);
