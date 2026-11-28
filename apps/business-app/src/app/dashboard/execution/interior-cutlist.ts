export type CutlistItemKey =
  | 'wardrobe'
  | 'kitchen_base'
  | 'kitchen_platform'
  | 'kitchen_overhead'
  | 'kitchen_loft'
  | 'loft'
  | 'individual'
  | 'crockery'
  | 'overhead'
  | 'tall_unit'
  | 'shoe_unit'
  | 'tv_unit'
  | 'pooja_unit'
  | 'study_unit';

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
    key: 'kitchen_overhead',
    label: 'Kitchen Overhead Cabinet',
    defaults: { width: 900, height: 720, depth: 350 },
  },
  {
    key: 'kitchen_platform',
    label: 'Kitchen Platform Base',
    defaults: { width: 2400, height: 720, depth: 560 },
  },
  {
    key: 'kitchen_loft',
    label: 'Kitchen Loft',
    defaults: { width: 900, height: 600, depth: 560 },
  },
  {
    key: 'loft',
    label: 'Loft Storage',
    defaults: { width: 1200, height: 600, depth: 600 },
  },
  {
    key: 'individual',
    label: 'Individual Storage Unit',
    defaults: { width: 600, height: 2100, depth: 600 },
  },
  {
    key: 'crockery',
    label: 'Crockery Unit',
    defaults: { width: 900, height: 2100, depth: 450 },
  },
  {
    key: 'overhead',
    label: 'Overhead Cabinet',
    defaults: { width: 1200, height: 720, depth: 350 },
  },
  {
    key: 'tall_unit',
    label: 'Tall Unit / Pantry',
    defaults: { width: 600, height: 2100, depth: 600 },
  },
  {
    key: 'shoe_unit',
    label: 'Shoe Unit',
    defaults: { width: 900, height: 1200, depth: 350 },
  },
  {
    key: 'tv_unit',
    label: 'TV Unit',
    defaults: { width: 1800, height: 1200, depth: 350 },
  },
  {
    key: 'pooja_unit',
    label: 'Pooja Unit',
    defaults: { width: 900, height: 2100, depth: 450 },
  },
  {
    key: 'study_unit',
    label: 'Study / Work Unit',
    defaults: { width: 1200, height: 2100, depth: 600 },
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
    edge = '0.8 mm edge band',
    grain: CutlistPanel['grain'] = 'length',
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
    edge,
    grain: name === 'Back panel' ? 'none' : grain,
  });
  if (item.key === 'kitchen_base') {
    return [
      panel('Side panel', 'KB-SIDE', height, depth, 2),
      panel('Shutter', 'KB-SHUTTER', height - 20, width / 2 - 3, 2),
      panel('Bottom', 'KB-BOTTOM', width - 36, depth - 40, 1),
      panel('Shelf', 'KB-SHELF', width - 36, depth - 40, 1),
    ];
  }
  if (item.key === 'kitchen_overhead' || item.key === 'overhead') {
    const prefix = item.key === 'kitchen_overhead' ? 'KO' : 'OH';
    return [
      panel('Side panel', `${prefix}-SIDE`, height, depth, 2),
      panel('Top / bottom', `${prefix}-TOP`, width, depth, 2),
      panel('Shelf', `${prefix}-SHELF`, width - 36, depth - 40, 1),
      panel('Shutter', `${prefix}-SHUTTER`, height - 20, width / 2 - 3, 2),
    ];
  }
  if (item.key === 'kitchen_platform') {
    return [
      panel('Platform side panel', 'KP-SIDE', height, depth, 2),
      panel('Platform bottom', 'KP-BOTTOM', width - 36, depth - 40, 1),
      panel('Platform divider', 'KP-DIVIDER', height - 36, depth - 40, 2),
      panel('Service shutter', 'KP-SHUTTER', height - 20, width / 3 - 3, 3),
    ];
  }
  if (item.key === 'kitchen_loft' || item.key === 'loft') {
    const prefix = item.key === 'kitchen_loft' ? 'KL' : 'LF';
    return [
      panel('Side panel', `${prefix}-SIDE`, height, depth, 2),
      panel('Top / bottom', `${prefix}-TOP`, width, depth, 2),
      panel('Shutter', `${prefix}-SHUTTER`, height - 20, width / 2 - 3, 2),
    ];
  }
  if (item.key === 'individual') {
    return [
      panel('Side panel', 'IND-SIDE', height, depth, 2),
      panel('Top / bottom', 'IND-TOP', width, depth, 2),
      panel('Shelf', 'IND-SHELF', width - 36, depth - 40, 3),
      panel('Shutter', 'IND-SHUTTER', height - 20, width - 6, 1),
    ];
  }
  if (item.key === 'crockery') {
    return [
      panel('Side panel', 'CR-SIDE', height, depth, 2),
      panel('Top / bottom', 'CR-TOP', width, depth, 2),
      panel('Shelf', 'CR-SHELF', width - 36, depth - 40, 4),
      panel(
        'Shutter',
        'CR-SHUTTER',
        height / 2 - 20,
        width / 2 - 3,
        4,
        '0.8 mm edge band',
        'length',
      ),
      panel(
        'Glass shelf',
        'CR-GLASS',
        width - 50,
        depth - 60,
        3,
        'Polished edge',
        'none',
      ),
    ];
  }
  if (item.key === 'tall_unit') {
    return [
      panel('Side panel', 'TU-SIDE', height, depth, 2),
      panel('Top / bottom', 'TU-TOP', width, depth, 2),
      panel('Shelf', 'TU-SHELF', width - 36, depth - 40, 5),
      panel('Shutter', 'TU-SHUTTER', height / 2 - 20, width - 6, 2),
    ];
  }
  if (item.key === 'shoe_unit') {
    return [
      panel('Side panel', 'SH-SIDE', height, depth, 2),
      panel('Top / bottom', 'SH-TOP', width, depth, 2),
      panel('Shelf', 'SH-SHELF', width - 36, depth - 40, 5),
      panel('Shutter', 'SH-SHUTTER', height, width / 2 - 3, 2),
    ];
  }
  if (item.key === 'tv_unit') {
    return [
      panel('Side panel', 'TV-SIDE', height, depth, 2),
      panel('Top / bottom', 'TV-TOP', width, depth, 2),
      panel('Shelf', 'TV-SHELF', width - 36, depth - 40, 1),
      panel('Back panel', 'TV-BACK', height, width, 1, 'No edge band', 'none'),
      panel('Drawer front', 'TV-DRAWER', 180, width / 2 - 3, 2),
    ];
  }
  if (item.key === 'pooja_unit') {
    return [
      panel('Side panel', 'PJ-SIDE', height, depth, 2),
      panel('Top / bottom', 'PJ-TOP', width, depth, 2),
      panel('Shelf', 'PJ-SHELF', width - 36, depth - 40, 3),
      panel('Shutter', 'PJ-SHUTTER', height / 2 - 20, width / 2 - 3, 2),
    ];
  }
  if (item.key === 'study_unit') {
    return [
      panel('Side panel', 'ST-SIDE', height, depth, 2),
      panel('Top / bottom', 'ST-TOP', width, depth, 2),
      panel('Shelf', 'ST-SHELF', width - 36, depth - 40, 3),
      panel('Shutter', 'ST-SHUTTER', height / 2 - 20, width / 2 - 3, 2),
    ];
  }
  return [
    panel('Side panel', 'WR-SIDE', height, depth, 2),
    panel('Top / bottom', 'WR-TOP', width, depth, 2),
    panel('Shelf', 'WR-SHELF', width - 36, depth - 40, 4),
    panel('Shutter', 'WR-SHUTTER', height - 20, width / 2 - 3, 2),
  ];
}
