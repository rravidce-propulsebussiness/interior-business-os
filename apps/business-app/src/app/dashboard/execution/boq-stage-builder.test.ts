import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoqStageBuilder } from './boq-stage-builder';
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
    expect(html.match(/boq-stage-misc-trigger/g)).toHaveLength(2);
    expect(html).not.toContain('Add a measured item');
    expect(html).not.toContain('Add Item');
    expect(html).toContain('Extra materials, labour or work for Foundation');
    expect(html).toContain('Extra materials, labour or work for Ground Floor');
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
