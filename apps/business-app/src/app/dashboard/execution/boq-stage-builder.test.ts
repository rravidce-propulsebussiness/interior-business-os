import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BoqStageBuilder,
  InputNumber,
  isDerivedQuantityReadOnly,
  withSlabSchedule,
} from './boq-stage-builder';
import { editorUnit } from './boq-compact-editor';
import { BoqFootingEditor } from './boq-footing-editor';
import { BarsPicker } from './boq-design-schedule';
import { newFootingType } from '@business-os/core/construction-boq';
import type {
  BoqCounts,
  BoqFloor,
  StructuralSettings,
} from '@business-os/core/construction-boq';

type StageProps = ComponentProps<typeof BoqStageBuilder>;
const noop = () => {};

const base: StageProps = {
  floors: [{ name: 'Ground Floor' } as BoqFloor],
  lines: [],
  projectId: '',
  projects: [],
  onProjectChange: noop,
  title: 'Test BOQ',
  onTitleChange: noop,
  quoteLabel: 'Final quotation',
  design: null,
  onDesignChange: noop,
  counts: { floors: {} } as BoqCounts,
  onCountsChange: noop,
  structuralSettings: {} as StructuralSettings,
  structuralRmcEnabled: true,
  structuralRmcRate: 5000,
  onStructuralRmcToggle: noop,
  onStructuralRmcRateChange: noop,
  onAddGeometry: noop,
  onUpdateGeometry: noop,
  onFloorChange: noop,
  repeatFrom: {},
  onRepeatFloors: noop,
  onCustomizeFloor: noop,
  onUpdateQuantity: noop,
  onResetQuantity: noop,
  onUpdateRate: noop,
  rateFor: (output) => output.rate ?? 0,
  onAddManual: noop,
  onUpdateMiscellaneous: noop,
  onRemoveManual: noop,
  onSave: noop,
  onDetailedBoq: noop,
  canOpenDetailed: true,
  canViewCost: true,
  canSave: true,
  busy: false,
  newDocument: true,
  initialStep: 4,
};

describe('compact BOQ entry stages', () => {
  it('shows only floor setup measurements without redundant save or cost labels', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        initialStep: 2,
        autoSaveLabel: 'Saved automatically',
        floors: [
          {
            name: 'Ground Floor',
            areaSqft: 1000,
            lengthFeet: 25,
            widthFeet: 40,
            heightFeet: 11,
          },
        ],
      }),
    );
    expect(html).toContain('Ground Floor');
    expect(html).toContain('Height (ft)');
    expect(html).not.toContain('Saved automatically');
    expect(html).not.toContain('Construction ERP');
    expect(html).not.toContain('Floor and Project Setup');
    expect(html).not.toContain('Total Stage Cost');
  });

  it('shows one Foundation page with every work editor and live preview', () => {
    const html = renderToStaticMarkup(createElement(BoqStageBuilder, base));
    expect(html).toContain('Step 3 of 11');
    expect(html).toContain('View or edit Excavation on Foundation');
    expect(html).toContain('View or edit Footings on Foundation');
    expect(html).toContain('View or edit Columns on Foundation');
    expect(html).toContain('View or edit Plinth Beam on Foundation');
    expect(html).toContain('aria-label="Stage Preview"');
    expect(html).toContain('Total Stage Cost');
    expect(html).toContain('Review Details');
    expect(html).toContain('Save &amp; Next');
    expect(html).not.toContain('Required construction work');
    expect(html).not.toContain('Test BOQ');
    expect((html.match(/boq-stage-misc-trigger/g) ?? []).length).toBe(1);
  });

  it('previews only entered amounts with separate material and labour totals', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        lines: [
          {
            id: 'foundation-test',
            name: 'Measured excavation',
            section: 'Foundation',
            kind: 'measured-geometry',
            inputs: {
              stageCategory: 'excavation',
              count: 1,
              lengthFeet: 10,
              widthFeet: 8,
              depthFeet: 2,
            },
            outputs: [
              {
                name: 'Excavation labour',
                material: 'labour_excavation',
                quantity: 2,
                unit: 'm³',
                rate: 300,
              },
              {
                name: 'Measured material',
                material: 'sand',
                quantity: 3,
                unit: 'm³',
                rate: 100,
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('₹600');
    expect(html).toContain('₹300');
    expect(html).toContain('₹900');
    expect(html).toContain('items need review');
    expect(html).toContain('Item Description');
  });

  it('keeps the one Foundation stage instead of duplicating columns per floor', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        initialStep: 4,
        floors: [
          { name: 'Ground Floor' } as BoqFloor,
          { name: 'First Floor' } as BoqFloor,
        ],
      }),
    );
    expect(html).not.toContain('aria-label="Jump to BOQ stage"');
    expect(html).toContain('Foundation');
    expect(html).toContain('View or edit Plinth Beam on Foundation');
  });

  it('shows Columns in the floor-wise RCC stage, not only Foundation', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, { ...base, initialStep: 7 }),
    );
    expect(html).toContain('4. RCC Structure');
    expect(html).toContain('View or edit Columns on Ground Floor');
    expect(html).toContain('View or edit Beams on Ground Floor');
    expect(html).toContain('View or edit Slab on Ground Floor');
  });

  it('shows Compound Wall on Ground Floor brickwork only', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, { ...base, initialStep: 8 }),
    );
    expect(html).toContain('Brickwork');
    expect(html).toContain('Compound Wall');
    expect(html).toContain('View or edit Compound Wall on Ground Floor');
  });

  it('keeps generated window sunshade costs under Windows without quantity removal', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        initialStep: 9,
        lines: [
          {
            id: 'shade-from-window',
            name: 'Ground Floor: window sunshades (from measured windows)',
            kind: 'quote-window-sajjas',
            section: 'Ground Floor',
            unit: 'each',
            origin: 'quotation-structure',
            inputs: { windowCount: 2 },
            outputs: [
              {
                name: 'Cement (window sunshades)',
                material: 'cement',
                quantity: 3,
                unit: 'bag',
                rate: 390,
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('View or edit Doors &amp; Windows on Ground Floor');
    expect(html).not.toContain('View or edit Sajjas / Sunshades');
    expect(
      isDerivedQuantityReadOnly(
        'quote-window-sajjas',
        'Cement (window sunshades)',
      ),
    ).toBe(true);
    expect(isDerivedQuantityReadOnly('quote-window-sajjas', '8 mm TMT')).toBe(
      true,
    );
    expect(isDerivedQuantityReadOnly('quote-masonry', 'Cement (plaster)')).toBe(
      true,
    );
    expect(isDerivedQuantityReadOnly('quote-doors-windows', 'Windows')).toBe(
      false,
    );
  });

  it('keeps one compact cement shelving entry without a second manual sunshade screen', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, { ...base, initialStep: 10 }),
    );
    expect(html).toContain('RCC Shelves');
    expect(html).toContain('View or edit RCC Shelves on Ground Floor');
    expect(html).not.toContain('View or edit Sajjas / Sunshades');
  });

  it('provides Penthouse / Headroom on the top-floor services screen', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        initialStep: 11,
        floors: [
          {
            name: 'Terrace',
            areaSqft: 400,
            lengthFeet: 20,
            widthFeet: 20,
            heightFeet: 10,
            penthouseSqft: 90,
          },
        ],
      }),
    );
    expect(html).toContain('Penthouse / Headroom');
    expect(html).toContain('90 sq ft');
    expect(html).toContain('View or edit Penthouse / Headroom');
    expect(html).toContain('Parapet Wall');
    expect(html).toContain('Waterproofing');
  });

  it('displays older manual items in Miscellaneous without dropping their costs', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        lines: [
          {
            id: 'saved-misc',
            name: 'Extra gravel delivery',
            section: 'Foundation',
            kind: 'manual',
            inputs: { quantity: 2, stageCategory: 'footings' },
            outputs: [
              {
                name: 'Extra gravel delivery',
                quantity: 2,
                unit: 'lot',
                rate: 300,
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('Miscellaneous');
    expect(html).toContain('1 item');
    expect(html).toContain('₹600');
  });
});

describe('beam reinforcement entry', () => {
  it('renders multiple diameter/count selections and Add rod size for one beam', () => {
    const html = renderToStaticMarkup(
      createElement(BarsPicker, {
        label: 'Plinth PB1',
        value: '4-16+2-12+2-10+2-20',
        onChange: noop,
      }),
    );
    for (const index of [1, 2, 3, 4]) {
      expect(html).toContain(`Plinth PB1 set ${index} bar diameter`);
    }
    expect(html).toContain('Add rod size to Plinth PB1');
    expect(html).toContain('+ Add rod size');
    expect(html).toContain('Remove Plinth PB1 set 3');
    expect((html.match(/bar diameter/g) ?? []).length).toBe(4);
  });
});

describe('independent Footings editor', () => {
  it('offers six foundation types, one/two steel meshes and optional pedestal without column fields', () => {
    const html = renderToStaticMarkup(
      createElement(BoqFootingEditor, {
        footings: [
          {
            ...newFootingType(0),
            count: 4,
            columnRefs: 'C1, C2',
            lengthFeet: 5,
            widthFeet: 5,
          },
        ],
        columnLabels: ['C1', 'C2'],
        onChange: noop,
      }),
    );
    expect(html).toContain('Foundation configuration');
    expect(html).toContain('Isolated — single-column');
    expect(html).toContain('Combined — two or more columns');
    expect(html).toContain('Strap — two pads');
    expect(html).toContain('Raft / mat');
    expect(html).toContain('Strip / continuous');
    expect(html).toContain('Pile cap');
    expect(html).toContain('Single mesh — bottom layer');
    expect(html).toContain('Double mesh — bottom + top');
    expect(html).toContain('Include RCC pedestal');
    expect(html).toContain('Supported column IDs');
    expect(html).not.toContain('Column width');
    expect(html).not.toContain('Main bars (e.g.');
  });
});

describe('BOQ measurement boxes read drawing sizes', () => {
  const render = (unit: string) =>
    renderToStaticMarkup(
      createElement(InputNumber, {
        label: 'Depth / thickness',
        value: 5.33,
        unit,
        onChange: () => {},
      }),
    );
  it('uses a feet-aware text box for feet, never a number box', () => {
    // A type="number" box turned 5'4" into 54 ft (899 m³ of excavation).
    const html = render('ft');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('inputMode="text"');
    expect(html).toContain('aria-label="Depth / thickness (ft)"');
  });
  it('keeps decimal entry for inches, millimetres and metres', () => {
    for (const unit of ['in', 'mm', 'm'])
      expect(render(unit)).toContain('inputMode="decimal"');
  });
  it('footing sizes are typed as on the drawing too', () => {
    const html = renderToStaticMarkup(
      createElement(BoqFootingEditor, {
        footings: [{ ...newFootingType(0), lengthFeet: 5, widthFeet: 5 }],
        columnLabels: ['C1'],
        onChange: () => {},
      }),
    );
    expect(html).not.toContain('type="number"');
    expect(html).toContain('(ft)');
  });
});

describe('slab schedule entry', () => {
  it('stores the whole slab bar schedule when one slab field changes', () => {
    expect(withSlabSchedule({}, 'slabDistSpacingIn', 6)).toEqual({
      slabThicknessIn: 5,
      slabMainDia: 10,
      slabMainSpacingIn: 6,
      slabDistDia: 8,
      slabDistSpacingIn: 6,
    });
  });

  it('confirms drawing values equal to the defaults and keeps entered ones', () => {
    expect(withSlabSchedule({ slabMainDia: 12 })).toMatchObject({
      slabMainDia: 12,
      slabThicknessIn: 5,
      slabDistSpacingIn: 8,
    });
  });

  it('leaves the slab alone when another setting changes', () => {
    expect(withSlabSchedule({}, 'coverMm', 40)).toEqual({ coverMm: 40 });
  });
});

describe('expanded volume worksheet', () => {
  const line = {
    id: 'excavation-one',
    name: 'F1-F12',
    section: 'Foundation',
    kind: 'measured-geometry',
    inputs: {
      stageCategory: 'excavation',
      count: 12,
      lengthFeet: 5,
      widthFeet: 5,
      depthFeet: 6,
    },
    outputs: [
      {
        name: 'Excavation (measured)',
        material: 'excavation',
        quantity: 50.97,
        unit: 'm³',
        rate: 150,
      },
    ],
  };
  const renderUnit = (unit: 'ft' | 'm', canViewCost = true) =>
    renderToStaticMarkup(
      createElement(BoqStageBuilder, {
        ...base,
        initialEditor: { stage: 'Foundation', category: 'excavation' },
        initialDimensionUnit: unit,
        lines: [line],
        canViewCost,
      }),
    );
  it('renders only one add button and the selected quantity/rate unit', () => {
    const ft = renderUnit('ft');
    const metric = renderUnit('m');
    const table = (html: string) =>
      html.slice(
        html.indexOf('boq-volume-editor'),
        html.indexOf('boq-volume-total') + 600,
      );
    expect(table(ft)).toContain('Quantity (CFT)');
    expect(table(ft)).toContain('Rate / CFT');
    expect(table(ft)).toContain('4.2475');
    expect(table(ft)).not.toContain('Quantity (m³)');
    expect(table(metric)).toContain('Quantity (m³)');
    expect(table(metric)).toContain('Rate / m³');
    expect(table(metric)).not.toContain('Quantity (CFT)');
    expect((table(ft).match(/boq-volume-add/g) ?? []).length).toBe(1);
    expect(table(ft)).not.toContain('Input dimension unit');
    const toolbar =
      table(ft).match(/<div class="boq-volume-toolbar">[\s\S]*?<\/div>/)?.[0] ??
      '';
    expect(toolbar).toContain('aria-label="Dimension unit"');
    expect(toolbar).toContain('boq-volume-add');
    expect(table(ft)).toContain('Remove F1-F12');
    expect(table(ft)).toContain('1,800');
    expect(table(metric)).toContain('50.97');
    expect(table(ft)).toContain('₹7,646');
    expect(table(metric)).toContain('₹7,646');
  });
  it('keeps costs hidden without cost permission', () => {
    const html = renderUnit('ft', false);
    expect(html).not.toContain('Rate / CFT');
    expect(html).not.toContain('₹7,646');
  });
});

describe('shared compact work editors', () => {
  it('converts area and volume presentation without changing the amount', () => {
    for (const [source, selected, expected] of [
      ['m³', 'ft', 'CFT'],
      ['sqft', 'm', 'm²'],
      ['ft', 'm', 'm'],
      ['kg', 'm', 'kg'],
    ] as const) {
      const display = editorUnit(source, selected);
      expect(display.unit).toBe(expected);
      expect(10 * display.factor * (150 / display.factor)).toBeCloseTo(1500);
    }
  });
  it.each([
    [4, 'Foundation', 'footings', 'Footings'],
    [4, 'Foundation', 'columns', 'Columns'],
    [4, 'Foundation', 'plinth', 'Plinth Beam'],
    [7, 'Ground Floor', 'beams', 'Beams'],
    [7, 'Ground Floor', 'slab', 'Slab'],
    [7, 'Ground Floor', 'staircase', 'Staircase'],
    [8, 'Ground Floor', 'brickwork', 'Brickwork'],
    [8, 'Ground Floor', 'compound', 'Compound Wall'],
    [9, 'Ground Floor', 'doors', 'Doors &amp; Windows'],
    [10, 'Ground Floor', 'plaster', 'Plastering'],
    [10, 'Ground Floor', 'painting', 'Painting'],
    [11, 'Ground Floor', 'tiles', 'Tiles'],
    [11, 'Ground Floor', 'electrical', 'Electrical'],
    [11, 'Ground Floor', 'plumbing', 'Plumbing'],
  ] as const)(
    'renders compact cost review for stage %s %s %s',
    (step, stage, category, title) => {
      const html = renderToStaticMarkup(
        createElement(BoqStageBuilder, {
          ...base,
          initialStep: step,
          initialEditor: { stage, category },
          floors: [
            {
              name: 'Ground Floor',
              areaSqft: 1000,
              lengthFeet: 40,
              widthFeet: 25,
              heightFeet: 11,
            },
          ],
        }),
      );
      expect(html).toContain('boq-compact-editor');
      expect(html).not.toContain('Input dimension unit');
      expect(html).toContain('aria-label="Dimension unit"');
      expect((html.match(/aria-label="Dimension unit"/g) ?? []).length).toBe(1);
      const toolbar =
        html.match(/<div class="boq-volume-toolbar">[\s\S]*?<\/div>/)?.[0] ??
        '';
      expect(toolbar).toContain('aria-label="Dimension unit"');
      if (
        [
          'footings',
          'columns',
          'plinth',
          'beams',
          'slab',
          'staircase',
          'brickwork',
          'tiles',
        ].includes(category)
      ) {
        expect(toolbar).toContain('boq-volume-add');
      }
      expect(html).toContain('aria-label="' + title + ' calculated costs"');
      expect(html).toContain('Total ' + title);
    },
  );
});
