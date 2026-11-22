import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BoqSlabScheduleEditor,
  BoqStaircaseScheduleEditor,
} from './boq-structural-schedule-editors';
import { BoqFootingEditor } from './boq-footing-editor';
import { BarsPicker } from './boq-design-schedule';
import { newFootingType } from '@business-os/core/construction-boq';

describe('single source structural drawing entry', () => {
  const noop = () => {};
  it('renders multiple structural slab types and steel directions', () => {
    const html = renderToStaticMarkup(createElement(BoqSlabScheduleEditor, {
      floor: 'Ground Floor',
      onChange: noop,
      panels: [
        { label: 'S1', floor: 'Ground Floor', count: 2, lengthFeet: 10,
          widthFeet: 12, thicknessIn: 6,
          reinforcement: [
            { layer: 'bottom', direction: 'length', dia: 16, spacingIn: 6 },
            { layer: 'top', direction: 'width', dia: 12, spacingIn: 8 },
          ] },
        { label: 'S2', floor: 'Ground Floor', count: 1, lengthFeet: 20,
          widthFeet: 10, thicknessIn: 5, reinforcement: [] },
      ],
    }));
    expect(html).toContain('S1');
    expect(html).toContain('S2');
    expect(html).toContain('Add slab panel type');
    expect(html).toContain('Add rod layer');
    expect(html).toContain('Bottom');
    expect(html).toContain('Top');
    expect(html).toContain('440');
    expect(html).toContain('No rods entered');
  });
  it('supports multiple staircase types and independent mixed main/distribution rows', () => {
    const html = renderToStaticMarkup(createElement(BoqStaircaseScheduleEditor, {
      floor: 'Ground Floor',
      onChange: noop,
      stairs: [
        { label: 'ST1', floor: 'Ground Floor', count: 2, widthFeet: 3.5,
          riserIn: 6, treadIn: 10, waistIn: 6, landingFeet: 4,
          reinforcement: [
            { role: 'main', dia: 12, spacingIn: 6 },
            { role: 'distribution', dia: 8, spacingIn: 8 },
          ] },
      ],
    }));
    expect(html).toContain('ST1');
    expect(html).toContain('Add staircase type');
    expect(html).toContain('Add stair rod set');
    expect(html).toContain('Distribution');
    expect(html).toContain('Identical stairs');
  });
  it('shows separate top/bottom mesh diameters for F1 without duplicating legacy mesh', () => {
    const html = renderToStaticMarkup(createElement(BoqFootingEditor, {
      footings: [{ ...newFootingType(0), count: 2,
        lengthFeet: 5, widthFeet: 4,
        reinforcement: [
          { layer: 'bottom', direction: 'length', dia: 16, spacingIn: 6 },
          { layer: 'top', direction: 'width', dia: 12, spacingIn: 8 },
        ],
      }],
      columnLabels: ['C1'],
      onChange: noop,
    }));
    expect(html).toContain('Add mesh rod size');
    expect(html).toContain('Restore previous mesh method');
    expect(html).not.toContain('Bottom bar diameter');
    expect(html).toContain('Bottom');
    expect(html).toContain('Top');
  });
  it('does not present unsaved default column reinforcement as entered', () => {
    const html = renderToStaticMarkup(createElement(BarsPicker, {
      label: 'C1 reinforcement',
      value: '',
      onChange: noop,
    }));
    expect(html).toContain('Add rod size');
    expect(html).not.toContain('C1 reinforcement set 1 number of bars');
  });
});
