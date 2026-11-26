import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  normalizeConcreteMix,
  normalizeStructuralSettings,
} from '@business-os/core/construction-boq';
import { BoqStructuralConcreteCard } from './boq-structural-concrete-card';

type Props = ComponentProps<typeof BoqStructuralConcreteCard>;
const base: Props = {
  enabled: true,
  mix: normalizeConcreteMix(null),
  onMixChange: () => {},
  rateForGrade: (grade) => (grade === 20 ? 5000 : 0),
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

describe('BOQ structural concrete costing', () => {
  it('shows the method and grade controls with an RMC rate', () => {
    const output = html();
    expect(output).toContain('Structural Concrete Costing');
    expect(output).toContain('Structural concrete method');
    expect(output).toContain('Ready-mix (RMC)');
    expect(output).toContain('Default concrete mix grade');
    expect(output).toContain('Member-specific grade overrides');
    expect(output).toContain('value="5000"');
    expect(output).toContain(
      'Cement, sand and aggregate for structural RCC are included',
    );
    expect(output).toContain(
      'PCC, sajjas, shelves, brickwork and plaster remain separate.',
    );
    expect(output).toContain('Saved automatically');
  });
  it('shows provisional M20 quantities and no cement brand selection in site mix', () => {
    const output = html({ enabled: false });
    expect(output).toContain('Site-mix material estimate');
    expect(output).toContain('8.06 bags/m³');
    expect(output).toContain('0.67 t/m³');
    expect(output).toContain('1.26 t/m³');
    expect(output).toContain('Verify mix design');
    expect(output).not.toContain('Cement grade &amp; purchase specification');
    expect(output).not.toContain('aria-label="RMC M20 rate per cubic metre"');
  });
  it('renders overrides and leaves unconfigured M25 mix unpriced', () => {
    const output = html({
      enabled: false,
      mix: normalizeConcreteMix({
        defaultGrade: 20,
        overrides: { Column: 25 },
      }),
    });
    expect(output).toContain('Column concrete grade');
    expect(output).toContain('M25 quantities remain unpriced');
    expect(output).toContain('M20 site-mix quantities');
  });
  it('respects edit and cost permission, without disclosing the rate', () => {
    const noCost = html({ canViewCost: false });
    expect(noCost).not.toContain('value="5000"');
    expect(noCost).toContain('disabled=""');
    expect(html({ canEdit: false })).toContain('disabled=""');
  });
});
