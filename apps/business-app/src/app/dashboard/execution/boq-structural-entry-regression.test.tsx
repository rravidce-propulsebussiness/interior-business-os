import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeDesign, parseBars } from '@business-os/core/construction-boq';
import { BarsPicker, parseEditableBars } from './boq-design-schedule';
import { beamTotalRunAfterCountChange } from './boq-beam-run-calculation';

describe('drawing-first structural reinforcement', () => {
  it('retains blank and partially selected rod sets without charging steel', () => {
    expect(parseEditableBars('0-0+4-0+0-16+2-12')).toEqual([
      { count: 0, dia: 0 },
      { count: 4, dia: 0 },
      { count: 0, dia: 16 },
      { count: 2, dia: 12 },
    ]);
    expect(parseBars('0-0+4-0+0-16+2-12')).toEqual([
      { count: 2, dia: 12 },
    ]);
  });

  it('supports historical drawing separators and multiple bar diameters', () => {
    expect(parseEditableBars('4 × 20 + 2 × 16 + 2-12')).toEqual([
      { count: 4, dia: 20 },
      { count: 2, dia: 16 },
      { count: 2, dia: 12 },
    ]);
    expect(parseEditableBars('41-20+2-50+bad')).toEqual([]);
  });

  it('renders blank count and diameter options rather than 2 × 12 mm defaults', () => {
    const html = renderToStaticMarkup(createElement(BarsPicker, {
      label: 'C1 reinforcement',
      value: '0-0+4-16',
      onChange: () => {},
    }));
    expect(html).toContain('Select count');
    expect(html).toContain('Select diameter');
    expect(html).toContain('C1 reinforcement set 1 bar diameter');
    expect(html).toContain('C1 reinforcement set 2 bar diameter');
    expect(html).toContain('Add rod size');
  });

  it('keeps unfinished reinforcement in saved structural drawing while generating no corresponding steel', () => {
    const normalized = normalizeDesign({
      columns: [{ label: 'C1', count: 4, floors: 1, widthIn: 9,
        depthIn: 12, bars: '0-0+4-0', tieDia: 8, tieSpacingIn: 6 }],
      beams: [{ label: 'B1', widthIn: 9, depthIn: 15,
        runFeet: [40], bars: '0-0', stirrupDia: 8, stirrupSpacingIn: 6 }],
      footings: [],
      plinthRunFeet: 0,
    });
    expect(normalized?.columns[0]?.bars).toBe('0-0+4-0');
    expect(normalized?.beams[0]?.bars).toBe('0-0');
    expect(parseBars(normalized?.columns[0]?.bars ?? '')).toHaveLength(0);
  });
});

describe('identical beam count changes', () => {
  it('preserves the per-beam span when an existing count changes', () => {
    expect(beamTotalRunAfterCountChange(45, 3, 4)).toBe(60);
    expect(beamTotalRunAfterCountChange(60, 4, 2)).toBe(30);
  });

  it('keeps legacy total run untouched when first entering or removing a count', () => {
    expect(beamTotalRunAfterCountChange(60, 0, 3)).toBe(60);
    expect(beamTotalRunAfterCountChange(60, 3, 0)).toBe(60);
    expect(beamTotalRunAfterCountChange(0, 0, 2)).toBe(0);
  });
});
