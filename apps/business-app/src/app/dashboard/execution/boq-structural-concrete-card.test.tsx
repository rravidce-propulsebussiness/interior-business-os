import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeStructuralSettings } from '@business-os/core/construction-boq';
import { BoqStructuralConcreteCard } from './boq-structural-concrete-card';

type Props = ComponentProps<typeof BoqStructuralConcreteCard>;
const base: Props = {
  enabled: true,
  ratePerM3: 5000,
  onToggle: () => {},
  onRateChange: () => {},
  settings: normalizeStructuralSettings({}),
  canEdit: true,
  canViewCost: true,
  autoSaveLabel: 'Saved automatically',
};
const html = (changes: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(BoqStructuralConcreteCard, { ...base, ...changes }),
  );

describe('BOQ structural concrete costing switch', () => {
  it('shows one switch for all structural RCC and a single editable M20 RMC rate', () => {
    const output = html();
    expect(output).toContain('Structural Concrete Costing');
    expect(output).toContain('role="switch"');
    expect(output).toContain('aria-checked="true"');
    expect(output).toContain('Ready-Mix (RMC)');
    expect(output).toContain('M20 Concrete');
    expect(output).toContain('value="5000"');
    for (const work of ['Footings', 'Columns', 'Beams', 'Slabs', 'Staircase'])
      expect(output).toContain(work);
    expect(output).toContain(
      'Cement, sand and aggregate for structural RCC are included',
    );
    expect(output).toContain('Saved automatically');
    expect(output.match(/role="switch"/g)).toHaveLength(1);
  });

  it('shows the existing M20 recipe when RMC is off, without an RMC rate input', () => {
    const output = html({ enabled: false });
    expect(output).toContain('aria-checked="false"');
    expect(output).toContain('Site-Mix Concrete');
    expect(output).toContain('8.06 bags/m³');
    expect(output).toContain('Sand');
    expect(output).toContain('Aggregate');
    expect(output).toContain('no RMC charge');
    expect(output).not.toContain('aria-label="RMC M20 rate per cubic metre"');
  });

  it('never applies RMC to PCC, sajjas, shelves, brickwork or plaster', () => {
    const enabled = html();
    const disabled = html({ enabled: false });
    for (const view of [enabled, disabled]) {
      expect(view).toContain('Other work — unchanged');
      expect(view).toContain('PCC · Sajjas · Shelves · Brickwork · Plaster');
    }
  });

  it('respects edit and cost permission, without disclosing the rate', () => {
    const noCost = html({ canViewCost: false });
    expect(noCost).not.toContain('value="5000"');
    expect(noCost).toContain('disabled=""');
    const readOnly = html({ canEdit: false });
    expect(readOnly).toContain('disabled=""');
  });
});
