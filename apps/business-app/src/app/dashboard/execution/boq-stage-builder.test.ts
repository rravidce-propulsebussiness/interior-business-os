import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoqStageBuilder } from './boq-stage-builder';
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
  it('shows three collapsed Foundation cards with Columns & Plinth visible', () => {
    const html = renderToStaticMarkup(createElement(BoqStageBuilder, base));
    expect((html.match(/boq-foundation-group-trigger/g) ?? []).length).toBe(3);
    expect(html).toContain('Excavation &amp; PCC');
    expect(html).toContain('Footings &amp; Pedestals');
    expect(html).toContain('Columns &amp; Plinth Beam');
    expect(html).not.toContain('View or edit Excavation on Foundation');
    expect(html).not.toContain('boq-stage-card-head');
    expect(html).not.toContain('Labour package allocation');
    expect(html).not.toContain('Other measured work');
    expect(html).toContain('Optional items');
    expect((html.match(/boq-stage-misc-trigger/g) ?? []).length).toBe(1);
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
    expect(html).toContain('Columns &amp; Plinth Beam');
  });

  it('shows Columns in the floor-wise RCC stage, not only Foundation', () => {
    const html = renderToStaticMarkup(
      createElement(BoqStageBuilder, { ...base, initialStep: 7 }),
    );
    expect(html).toContain('Columns, Beams, Slab');
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
    expect(html).toContain('Add Plinth PB1 reinforcement set');
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
