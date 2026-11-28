import { describe, expect, it } from 'vitest';
import { CUTLIST_ITEMS, cutlistPanels } from './interior-cutlist';
import { BOARD_SIZES, optimizeBoardLayout } from './board-optimizer';

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

  it('packs panels into boards, records placements and rotates when required', () => {
    const item = CUTLIST_ITEMS.find((entry) => entry.key === 'wardrobe')!;
    const panels = cutlistPanels(
      item,
      { width: 1200, height: 2100, depth: 600 },
      1,
    );
    const layouts = optimizeBoardLayout(panels, BOARD_SIZES[0]!);
    expect(layouts.length).toBeGreaterThan(0);
    expect(layouts.flatMap((layout) => layout.placements)).toHaveLength(10);
    expect(
      layouts.every(
        (layout) => layout.wastePercent >= 0 && layout.wastePercent <= 100,
      ),
    ).toBe(true);
  });

  it('supports the complete interior unit catalog', () => {
    const keys = CUTLIST_ITEMS.map((item) => item.key);
    expect(keys).toEqual([
      'wardrobe',
      'kitchen_base',
      'kitchen_overhead',
      'kitchen_platform',
      'kitchen_loft',
      'loft',
      'individual',
      'crockery',
      'overhead',
      'tall_unit',
      'shoe_unit',
      'tv_unit',
      'pooja_unit',
      'study_unit',
    ]);
    for (const item of CUTLIST_ITEMS) {
      const rows = cutlistPanels(item, item.defaults, 1);
      expect(rows.length, item.key).toBeGreaterThan(0);
      expect(
        rows.every((row) => row.quantity > 0),
        item.key,
      ).toBe(true);
    }
  });
});
