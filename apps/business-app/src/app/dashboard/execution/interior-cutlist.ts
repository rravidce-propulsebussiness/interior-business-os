export type CutlistItemKey = 'wardrobe' | 'kitchen_base' | 'tv_unit';

export type CutlistItem = {
  key: CutlistItemKey;
  label: string;
  defaults: { width: number; height: number; depth: number };
};

export type CutlistPanel = {
  id: string;
  item: string;
  panel: string;
  code: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  thickness: number;
  edge: string;
  grain: 'length' | 'width' | 'none';
};

export const CUTLIST_ITEMS: readonly CutlistItem[] = [
  {
    key: 'wardrobe',
    label: 'Wardrobe',
    defaults: { width: 1200, height: 2100, depth: 600 },
  },
  {
    key: 'kitchen_base',
    label: 'Kitchen Base Cabinet',
    defaults: { width: 900, height: 720, depth: 560 },
  },
  {
    key: 'tv_unit',
    label: 'TV Unit',
    defaults: { width: 1800, height: 1200, depth: 350 },
  },
];

export function cutlistPanels(
  item: CutlistItem,
  dimensions: { width: number; height: number; depth: number },
  cabinetCount: number,
): CutlistPanel[] {
  const width = Math.max(0, dimensions.width);
  const height = Math.max(0, dimensions.height);
  const depth = Math.max(0, dimensions.depth);
  const count = Math.max(1, Math.round(cabinetCount));
  const panel = (
    name: string,
    code: string,
    length: number,
    panelWidth: number,
    quantity: number,
  ): CutlistPanel => ({
    id: `${code}-${crypto.randomUUID()}`,
    item: item.label,
    panel: name,
    code,
    length: Math.round(length),
    width: Math.round(panelWidth),
    quantity: Math.max(0, Math.round(quantity * count)),
    material: '18 mm plywood',
    thickness: 18,
    edge: '0.8 mm edge band',
    grain: name === 'Back panel' ? 'none' : 'length',
  });
  if (item.key === 'kitchen_base') {
    return [
      panel('Side panel', 'KB-SIDE', height, depth, 2),
      panel('Shutter', 'KB-SHUTTER', height - 20, width / 2 - 3, 2),
      panel('Bottom', 'KB-BOTTOM', width - 36, depth - 40, 1),
      panel('Shelf', 'KB-SHELF', width - 36, depth - 40, 1),
    ];
  }
  if (item.key === 'tv_unit') {
    return [
      panel('Side panel', 'TV-SIDE', height, depth, 2),
      panel('Top / bottom', 'TV-TOP', width, depth, 2),
      panel('Back panel', 'TV-BACK', height, width, 1),
    ];
  }
  return [
    panel('Side panel', 'WR-SIDE', height, depth, 2),
    panel('Top / bottom', 'WR-TOP', width, depth, 2),
    panel('Shelf', 'WR-SHELF', width - 36, depth - 40, 4),
    panel('Shutter', 'WR-SHUTTER', height - 20, width / 2 - 3, 2),
  ];
}
