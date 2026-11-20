export type BoqOutput = {
  name: string;
  quantity: number;
  unit: string;
  source?: string;
};
export type BoqInputs = Record<string, string | number | boolean>;
const number = (inputs: BoqInputs, key: string, fallback = 0) => {
  const value = Number(inputs[key]);
  return Number.isFinite(value) ? value : fallback;
};
const ceil = (n: number) => Math.ceil(Math.max(0, n));
const round = (n: number, places = 3) => Number(Math.max(0, n).toFixed(places));
const steelKgPerMetre = (diameterMm: number) => (diameterMm * diameterMm) / 162;

export function calculateBoq(kind: string, input: BoqInputs): BoqOutput[] {
  // A pedestal is a short, wider column on the footing; a plinth beam is a
  // beam at plinth level. Same concrete and steel rules, own templates.
  if (kind === 'pedestal') return calculateBoq('column', input);
  if (kind === 'plinth_beam') return calculateBoq('beam', input);
  if (kind === 'column') {
    const count = number(input, 'count', 1);
    const length = number(input, 'length');
    const width = number(input, 'width');
    const height = number(input, 'height');
    const concrete = count * length * width * height;
    const outputs: BoqOutput[] = [
      { name: 'RCC concrete volume', quantity: round(concrete), unit: 'm³' },
      {
        name: 'Cement (M20 nominal mix)',
        quantity: round(concrete * 8.06, 2),
        unit: 'bag',
      },
      {
        name: 'Sand (M20 nominal mix)',
        quantity: round(concrete * 0.42),
        unit: 'm³',
      },
      {
        name: '20 mm aggregate (M20 nominal mix)',
        quantity: round(concrete * 0.84),
        unit: 'm³',
      },
    ];
    const steel = [
      { diameter: 16, bars: number(input, 'main16', 4) },
      { diameter: 12, bars: number(input, 'main12', 2) },
      { diameter: 10, bars: number(input, 'main10') },
    ];
    for (const bar of steel.filter((item) => item.bars > 0)) {
      const totalMetres = count * bar.bars * (height + 0.6);
      outputs.push({
        name: `${bar.diameter} mm main bars`,
        quantity: ceil(totalMetres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${round(totalMetres)} m · ${round(totalMetres * steelKgPerMetre(bar.diameter), 1)} kg`,
      });
    }
    const ringDiameter = number(input, 'ringDiameter', 6);
    const spacingMm = number(input, 'ringSpacing', 150);
    if (ringDiameter && spacingMm && width && length && height) {
      const cover = number(input, 'cover', 0.04);
      const ringsPerColumn = ceil((height * 1000) / spacingMm) + 1;
      const ringLength =
        2 * (Math.max(0, width - 2 * cover) + Math.max(0, length - 2 * cover)) +
        (20 * ringDiameter) / 1000;
      const totalMetres = count * ringsPerColumn * ringLength;
      outputs.push({
        name: `${ringDiameter} mm rings @ ${spacingMm} mm`,
        quantity: ceil(totalMetres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${ringsPerColumn * count} rings · ${round(totalMetres)} m · ${round(totalMetres * steelKgPerMetre(ringDiameter), 1)} kg`,
      });
    }
    return outputs;
  }
  if (kind === 'beam') {
    const count = number(input, 'count', 1);
    const length = number(input, 'length');
    const width = number(input, 'width');
    const height = number(input, 'height');
    const volume = count * length * width * height;
    const outputs: BoqOutput[] = [
      { name: 'RCC concrete volume', quantity: round(volume), unit: 'm³' },
      {
        name: 'Cement (M20 nominal mix)',
        quantity: round(volume * 8.06, 2),
        unit: 'bag',
      },
      {
        name: 'Sand (M20 nominal mix)',
        quantity: round(volume * 0.42),
        unit: 'm³',
      },
      {
        name: '20 mm aggregate (M20 nominal mix)',
        quantity: round(volume * 0.84),
        unit: 'm³',
      },
    ];
    for (const bar of [
      { diameter: 16, bars: number(input, 'main16', 2) },
      { diameter: 12, bars: number(input, 'main12', 2) },
      { diameter: 10, bars: number(input, 'main10') },
    ].filter((item) => item.bars > 0)) {
      const metres = count * bar.bars * (length + 0.6);
      outputs.push({
        name: `${bar.diameter} mm main bars`,
        quantity: ceil(metres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${round(metres)} m · ${round(metres * steelKgPerMetre(bar.diameter), 1)} kg`,
      });
    }
    const tie = number(input, 'ringDiameter', 8);
    const spacing = number(input, 'ringSpacing', 150);
    if (tie && spacing && width && height && length) {
      const cover = number(input, 'cover', 0.04);
      const ties = ceil((length * 1000) / spacing) + 1;
      const tieLength =
        2 * (Math.max(0, width - 2 * cover) + Math.max(0, height - 2 * cover)) +
        (20 * tie) / 1000;
      const metres = count * ties * tieLength;
      outputs.push({
        name: `${tie} mm beam stirrups @ ${spacing} mm`,
        quantity: ceil(metres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${ties * count} stirrups · ${round(metres)} m · ${round(metres * steelKgPerMetre(tie), 1)} kg`,
      });
    }
    return outputs;
  }
  if (kind === 'footing') {
    const count = number(input, 'count', 1);
    const length = number(input, 'length');
    const width = number(input, 'width');
    const depth = number(input, 'depth');
    const volume = count * length * width * depth;
    const outputs: BoqOutput[] = [
      { name: 'RCC concrete volume', quantity: round(volume), unit: 'm³' },
      {
        name: 'Cement (M20 nominal mix)',
        quantity: round(volume * 8.06, 2),
        unit: 'bag',
      },
      {
        name: 'Sand (M20 nominal mix)',
        quantity: round(volume * 0.42),
        unit: 'm³',
      },
      {
        name: '20 mm aggregate (M20 nominal mix)',
        quantity: round(volume * 0.84),
        unit: 'm³',
      },
    ];
    const diameter = number(input, 'barDiameter', 12);
    const spacing = number(input, 'barSpacing', 150) / 1000;
    const cover = number(input, 'cover', 0.05);
    const usableLength = Math.max(0, length - 2 * cover);
    const usableWidth = Math.max(0, width - 2 * cover);
    if (diameter && spacing && usableLength && usableWidth) {
      const barsAlongLength = ceil(usableWidth / spacing) + 1;
      const barsAlongWidth = ceil(usableLength / spacing) + 1;
      const metres =
        count * (barsAlongLength * usableLength + barsAlongWidth * usableWidth);
      outputs.push({
        name: `Footing bars ${diameter} mm`,
        quantity: ceil(metres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${round(metres)} m · ${round(metres * steelKgPerMetre(diameter), 1)} kg`,
      });
    }
    return outputs;
  }
  if (kind === 'excavation') {
    const volume =
      number(input, 'count', 1) *
      number(input, 'length') *
      number(input, 'width') *
      number(input, 'depth');
    return [
      { name: 'Excavation volume', quantity: round(volume), unit: 'm³' },
      {
        name: 'Loose soil for disposal',
        quantity: round(volume * (1 + number(input, 'bulking', 20) / 100)),
        unit: 'm³',
      },
    ];
  }
  if (kind === 'wall') {
    const area = Math.max(
      0,
      (number(input, 'length') * number(input, 'height') -
        number(input, 'openings')) *
        10.7639,
    );
    const thickness = number(input, 'thickness', 4);
    return [
      {
        name: `${thickness} inch brick wall`,
        quantity: round(area),
        unit: 'sqft',
      },
      {
        name: 'Bricks',
        quantity: ceil(
          area *
            (thickness <= 4.5
              ? number(input, 'bricksPerSqft4', 4.5)
              : number(input, 'bricksPerSqft9', 9)),
        ),
        unit: 'each',
      },
      {
        name: 'Mortar sand (allowance)',
        quantity: round(area * (thickness <= 4.5 ? 0.004 : 0.008)),
        unit: 'm³',
      },
      {
        name: 'Cement (allowance)',
        quantity: round(area * (thickness <= 4.5 ? 0.12 : 0.24), 2),
        unit: 'bag',
      },
    ];
  }
  if (kind === 'slab') {
    const count = number(input, 'count', 1);
    const length = number(input, 'length');
    const width = number(input, 'width');
    const thickness = number(input, 'thickness', 0.15);
    const volume = count * length * width * thickness;
    const outputs: BoqOutput[] = [
      { name: 'RCC concrete volume', quantity: round(volume), unit: 'm³' },
      {
        name: 'Cement (M20 nominal mix)',
        quantity: round(volume * 8.06, 2),
        unit: 'bag',
      },
      {
        name: 'Sand (M20 nominal mix)',
        quantity: round(volume * 0.42),
        unit: 'm³',
      },
      {
        name: '20 mm aggregate (M20 nominal mix)',
        quantity: round(volume * 0.84),
        unit: 'm³',
      },
      {
        name: 'Slab shuttering',
        quantity: round(count * length * width * 10.7639),
        unit: 'sqft',
      },
    ];
    const dia = number(input, 'barDiameter', 10);
    const spacing = number(input, 'barSpacing', 150) / 1000;
    if (dia && spacing) {
      const barsLong = ceil(width / spacing) + 1;
      const barsShort = ceil(length / spacing) + 1;
      const totalMetres = count * (barsLong * length + barsShort * width);
      outputs.push({
        name: `${dia} mm slab bars @ ${spacing * 1000} mm`,
        quantity: ceil(totalMetres / number(input, 'rodLength', 12)),
        unit: 'rod',
        source: `${round(totalMetres)} m · ${round(totalMetres * steelKgPerMetre(dia), 1)} kg`,
      });
    }
    return outputs;
  }
  if (kind === 'surface') {
    const area = Math.max(
      0,
      (number(input, 'length') * number(input, 'height') -
        number(input, 'openings')) *
        10.7639,
    );
    const label = String(input.surfaceType || 'Surface');
    const wastage = number(
      input,
      'waste',
      label.toLowerCase().includes('tile') ? 5 : 0,
    );
    const net = area * (1 + wastage / 100);
    return [
      { name: label, quantity: round(net), unit: 'sqft' },
      ...(label.toLowerCase().includes('plaster')
        ? [
            {
              name: 'Cement (plaster allowance)',
              quantity: round(net * 0.045, 2),
              unit: 'bag',
            },
            { name: 'Plaster sand', quantity: round(net * 0.0045), unit: 'm³' },
          ]
        : []),
      ...(label.toLowerCase().includes('paint')
        ? [
            {
              name: 'Primer (1 coat allowance)',
              quantity: round(net / 100),
              unit: 'litre',
            },
            {
              name: `Paint (${number(input, 'coats', 1)} coat${number(input, 'coats', 1) === 1 ? '' : 's'})`,
              quantity: round((net / 100) * number(input, 'coats', 1)),
              unit: 'litre',
            },
          ]
        : []),
      ...(label.toLowerCase().includes('tile')
        ? [
            { name: 'Tile adhesive', quantity: round(net * 0.1), unit: 'kg' },
            { name: 'Tile grout', quantity: round(net * 0.04), unit: 'kg' },
          ]
        : []),
    ];
  }
  const quantity = number(input, 'quantity');
  return [
    {
      name: String(input.outputName || 'Measured quantity'),
      quantity: round(quantity),
      unit: String(input.unit || 'each'),
    },
  ];
}

export const BOQ_TEMPLATES = [
  {
    kind: 'excavation',
    label: 'Excavation / earthwork',
    section: 'Site preparation',
  },
  {
    kind: 'footing',
    label: 'Footing (grid mat)',
    section: 'Foundation',
  },
  { kind: 'pedestal', label: 'Pedestal', section: 'Foundation' },
  { kind: 'column', label: 'RCC column + reinforcement', section: 'Structure' },
  { kind: 'plinth_beam', label: 'Plinth beam', section: 'Foundation' },
  { kind: 'beam', label: 'RCC beam + stirrups', section: 'Structure' },
  { kind: 'slab', label: 'RCC slab + reinforcement', section: 'Structure' },
  { kind: 'wall', label: 'Brick wall (4 inch / 9 inch)', section: 'Masonry' },
  {
    kind: 'surface',
    label: 'Plaster / paint / tile area',
    section: 'Finishes',
  },
  { kind: 'manual', label: 'Manual quantity / labour', section: 'General' },
] as const;

export const inputDefinitions: Record<
  string,
  { key: string; label: string; value: string }[]
> = {
  excavation: [
    { key: 'count', label: 'Number of pits / trenches', value: '5' },
    { key: 'length', label: 'Length (m)', value: '1.5' },
    { key: 'width', label: 'Width (m)', value: '1.5' },
    { key: 'depth', label: 'Depth (m)', value: '1.5' },
    { key: 'bulking', label: 'Soil bulking (%)', value: '20' },
  ],
  footing: [
    { key: 'count', label: 'Same footings', value: '5' },
    { key: 'length', label: 'Length (m)', value: '1.5' },
    { key: 'width', label: 'Width (m)', value: '1.5' },
    { key: 'depth', label: 'Depth (m)', value: '0.45' },
    { key: 'barDiameter', label: 'Grid mat bar diameter (mm)', value: '12' },
    { key: 'barSpacing', label: 'Bar spacing (mm)', value: '150' },
    { key: 'cover', label: 'Concrete cover (m)', value: '0.05' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  pedestal: [
    { key: 'count', label: 'Same pedestals', value: '5' },
    { key: 'length', label: 'Length (m)', value: '0.38' },
    { key: 'width', label: 'Width (m)', value: '0.38' },
    { key: 'height', label: 'Height (m)', value: '0.6' },
    { key: 'main16', label: '16 mm bars / pedestal', value: '4' },
    { key: 'main12', label: '12 mm bars / pedestal', value: '4' },
    { key: 'main10', label: '10 mm bars / pedestal', value: '0' },
    { key: 'ringDiameter', label: 'Ring diameter (mm)', value: '8' },
    { key: 'ringSpacing', label: 'Ring spacing (mm)', value: '150' },
    { key: 'cover', label: 'Concrete cover (m)', value: '0.04' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  column: [
    { key: 'count', label: 'Same columns', value: '5' },
    { key: 'length', label: 'Length (m)', value: '0.23' },
    { key: 'width', label: 'Width (m)', value: '0.23' },
    { key: 'height', label: 'Height (m)', value: '3' },
    { key: 'main16', label: '16 mm bars / column', value: '4' },
    { key: 'main12', label: '12 mm bars / column', value: '2' },
    { key: 'main10', label: '10 mm bars / column', value: '0' },
    { key: 'ringDiameter', label: 'Ring diameter (mm)', value: '6' },
    { key: 'ringSpacing', label: 'Ring spacing (mm)', value: '150' },
    { key: 'cover', label: 'Concrete cover (m)', value: '0.04' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  plinth_beam: [
    { key: 'count', label: 'Same plinth beams', value: '8' },
    { key: 'length', label: 'Beam length (m)', value: '4' },
    { key: 'width', label: 'Beam width (m)', value: '0.23' },
    { key: 'height', label: 'Beam depth (m)', value: '0.38' },
    { key: 'main16', label: '16 mm bars / beam', value: '0' },
    { key: 'main12', label: '12 mm bars / beam', value: '4' },
    { key: 'main10', label: '10 mm bars / beam', value: '0' },
    { key: 'ringDiameter', label: 'Stirrup diameter (mm)', value: '8' },
    { key: 'ringSpacing', label: 'Stirrup spacing (mm)', value: '150' },
    { key: 'cover', label: 'Concrete cover (m)', value: '0.04' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  beam: [
    { key: 'count', label: 'Same beams', value: '5' },
    { key: 'length', label: 'Beam length (m)', value: '4' },
    { key: 'width', label: 'Beam width (m)', value: '0.23' },
    { key: 'height', label: 'Beam depth (m)', value: '0.45' },
    { key: 'main16', label: '16 mm bars / beam', value: '2' },
    { key: 'main12', label: '12 mm bars / beam', value: '2' },
    { key: 'main10', label: '10 mm bars / beam', value: '0' },
    { key: 'ringDiameter', label: 'Stirrup diameter (mm)', value: '8' },
    { key: 'ringSpacing', label: 'Stirrup spacing (mm)', value: '150' },
    { key: 'cover', label: 'Concrete cover (m)', value: '0.04' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  slab: [
    { key: 'count', label: 'Number of slabs', value: '1' },
    { key: 'length', label: 'Length (m)', value: '10' },
    { key: 'width', label: 'Width (m)', value: '8' },
    { key: 'thickness', label: 'Thickness (m)', value: '0.15' },
    { key: 'barDiameter', label: 'Bar diameter (mm)', value: '10' },
    { key: 'barSpacing', label: 'Bar spacing (mm)', value: '150' },
    { key: 'rodLength', label: 'Stock rod length (m)', value: '12' },
  ],
  wall: [
    { key: 'length', label: 'Wall length (m)', value: '10' },
    { key: 'height', label: 'Wall height (m)', value: '3' },
    { key: 'thickness', label: 'Wall thickness (inches)', value: '4' },
    { key: 'openings', label: 'Door/window deductions (m²)', value: '0' },
    { key: 'bricksPerSqft4', label: 'Bricks / sqft (4 inch)', value: '4.5' },
    { key: 'bricksPerSqft9', label: 'Bricks / sqft (9 inch)', value: '9' },
  ],
  surface: [
    { key: 'surfaceType', label: 'Work type', value: 'Internal plaster' },
    { key: 'length', label: 'Length (m)', value: '10' },
    { key: 'height', label: 'Height (m)', value: '3' },
    { key: 'openings', label: 'Opening deductions (m²)', value: '0' },
    { key: 'waste', label: 'Wastage (%)', value: '0' },
    { key: 'coats', label: 'Paint coats', value: '1' },
  ],
  manual: [
    {
      key: 'outputName',
      label: 'Material / labour item',
      value: 'General labour',
    },
    { key: 'quantity', label: 'Quantity', value: '1' },
    { key: 'unit', label: 'Unit', value: 'day' },
  ],
};
