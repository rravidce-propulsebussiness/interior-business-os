import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoqStageBuilder } from './boq-stage-builder';
import { BoqFootingEditor } from './boq-footing-editor';
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
  onPrint: noop,
  onAdvanced: noop,
  canViewCost: true,
  canSave: true,
  busy: false,
  newDocument: true,
};

describe('stage-wise miscellaneous BOQ UI', () => {
  it('shows one compact Miscellaneous action per expanded stage instead of repeated generic item forms', () => {
    const html = renderToStaticMarkup(createElement(BoqStageBuilder, base));
    expect(html.match(/boq-stage-misc-trigger/g)).toHaveLength(1);
    expect(html).not.toContain('Add a measured item');
    expect(html).not.toContain('Add Item');
    expect(html).toContain('Extra materials, labour or work for Foundation');
    expect(html).not.toContain(
      'Extra materials, labour or work for Ground Floor',
    );
    // Only the selected stage is visible until the user chooses another floor.
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
