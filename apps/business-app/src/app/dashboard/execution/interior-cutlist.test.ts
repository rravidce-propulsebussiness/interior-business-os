import { describe, expect, it } from 'vitest';
import { CUTLIST_ITEMS, cutlistPanels } from './interior-cutlist';

describe('interior cutlist generators', () => {
  it('creates wardrobe sides, tops, shelves and shutters', () => {
    const item = CUTLIST_ITEMS.find((entry) => entry.key === 'wardrobe')!;
    const rows = cutlistPanels(
      item,
      { width: 1200, height: 2100, depth: 600 },
      1,
    );
    expect(rows.map((row) => row.code)).toEqual([
      'WR-SIDE',
      'WR-TOP',
      'WR-SHELF',
      'WR-SHUTTER',
    ]);
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(10);
  });

  it('scales every panel quantity by cabinet count', () => {
    const item = CUTLIST_ITEMS.find((entry) => entry.key === 'kitchen_base')!;
    const rows = cutlistPanels(
      item,
      { width: 900, height: 720, depth: 560 },
      3,
    );
    expect(rows.find((row) => row.code === 'KB-SIDE')?.quantity).toBe(6);
    expect(rows.find((row) => row.code === 'KB-SHUTTER')?.quantity).toBe(6);
  });
});
