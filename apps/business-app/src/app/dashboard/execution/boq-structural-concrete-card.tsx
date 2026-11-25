'use client';

import {
  M20_SITE_MIX_PER_M3,
  type StructuralSettings,
} from '@business-os/core/construction-boq';

import {
  CUSTOM_CEMENT_VARIANT,
  customCementNameKey,
  customCementRateKey,
  selectedVariant,
  variantsFor,
  type CementUse,
  type Rate,
} from './boq-pricing';

type Props = {
  cementRates?: readonly Rate[];
  cementSelections?: Readonly<Record<string, string>>;
  onCementSelectionChange?: (key: string, value: string) => void;
  enabled: boolean;
  ratePerM3: number;
  onToggle: (enabled: boolean) => void;
  onRateChange: (rate: number) => void;
  settings: StructuralSettings;
  canEdit: boolean;
  canViewCost: boolean;
  autoSaveLabel?: string | undefined;
};

const figure = (amount: number) =>
  amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function BoqStructuralConcreteCard({
  enabled,
  ratePerM3,
  onToggle,
  onRateChange,
  settings,
  canEdit,
  canViewCost,
  autoSaveLabel,
  cementRates = [],
  cementSelections = {},
  onCementSelectionChange,
}: Props) {
  const editable = canEdit && canViewCost;
  return (
    <section
      className="boq-rmc-card"
      aria-labelledby="boq-rmc-heading"
      data-mode={enabled ? 'ready' : 'site'}
    >
      <div className="boq-rmc-top">
        <span className="boq-rmc-layers" aria-hidden="true">
          <svg
            viewBox="0 0 36 36"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinejoin="round"
          >
            <path d="M18 3 3 12l15 9 15-9-15-9Z" />
            <path d="m3 19 15 9 15-9M3 26l15 8 15-8" />
          </svg>
        </span>
        <div className="boq-rmc-heading">
          <h3 id="boq-rmc-heading">Structural Concrete Costing</h3>
          <p>Applies to all structural RCC</p>
        </div>
        <button
          type="button"
          className="boq-rmc-toggle"
          role="switch"
          aria-label="Structural Ready-Mix Concrete (RMC)"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          disabled={!editable}
        >
          <span>{enabled ? 'ON' : 'OFF'}</span>
          <i aria-hidden="true" />
        </button>
      </div>

      {enabled ? (
        <>
          <div className="boq-rmc-ready">
            <div className="boq-rmc-supply">
              <span className="boq-rmc-supply-symbol" aria-hidden="true">
                ▰
              </span>
              <span>
                <strong>Ready-Mix (RMC)</strong>
                <small>M20 Concrete</small>
              </span>
            </div>
            {canViewCost && (
              <label className="boq-rmc-rate">
                <span className="boq-rmc-sr-only">
                  RMC M20 rate per cubic metre
                </span>
                <span aria-hidden="true">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={ratePerM3}
                  aria-label="RMC M20 rate per cubic metre"
                  onChange={(event) =>
                    onRateChange(Math.max(0, Number(event.target.value) || 0))
                  }
                  disabled={!editable}
                />
                <span>/ m³</span>
              </label>
            )}
          </div>
          <div className="boq-rmc-applied">
            <span aria-hidden="true">✓</span> Applied to all structural RCC
          </div>
          <div
            className="boq-rmc-tags"
            aria-label="Works included in structural RMC"
          >
            {['Footings', 'Columns', 'Beams', 'Slabs', 'Staircase'].map(
              (work) => (
                <span key={work}>
                  <b aria-hidden="true">✓</b> {work}
                </span>
              ),
            )}
          </div>
          <p className="boq-rmc-note">
            Cement, sand and aggregate for structural RCC are included in RMC.
          </p>
        </>
      ) : (
        <div className="boq-rmc-site">
          <div className="boq-rmc-supply">
            <span className="boq-rmc-supply-symbol" aria-hidden="true">
              ♧
            </span>
            <span>
              <strong>Site-Mix Concrete</strong>
              <small>M20 · Material-wise calculation</small>
            </span>
          </div>
          <div
            className="boq-rmc-recipe"
            aria-label="M20 site-mix quantities per cubic metre"
          >
            <div>
              <span>Cement</span>
              <strong>{figure(M20_SITE_MIX_PER_M3.cementBags)} bags/m³</strong>
            </div>
            <div>
              <span>Sand</span>
              <strong>
                {figure(
                  M20_SITE_MIX_PER_M3.sandCubicMetres * settings.sandTonPerCum,
                )}{' '}
                t/m³
              </strong>
            </div>
            <div>
              <span>20 mm Aggregate</span>
              <strong>
                {figure(
                  M20_SITE_MIX_PER_M3.aggregateCubicMetres *
                    settings.aggregateTonPerCum,
                )}{' '}
                t/m³
              </strong>
            </div>
          </div>
        </div>
      )}

      {onCementSelectionChange && (
        <div className="boq-rmc-other">
          <strong>Cement grade &amp; purchase specification</strong>
          <small>Grades and brands from the selected quotation and rate card. Confirm the approved mix separately.</small>
          <div className="boq-stage-input-grid">
            {(['cement', 'cement_masonry'] as const).map((use: CementUse) => {
              const variants = variantsFor(cementRates, use).filter(rate => rate.variant !== CUSTOM_CEMENT_VARIANT);
              const selected = selectedVariant(cementRates, use, cementSelections);
              const value = cementSelections[use] === CUSTOM_CEMENT_VARIANT ? CUSTOM_CEMENT_VARIANT : selected?.variant ?? '';
              return (
                <div key={use} className="boq-stage-field">
                  <label>
                    <span>{use === 'cement' ? 'RCC / concrete cement' : 'Brickwork & plaster cement'}</span>
                    <select value={value} onChange={event => onCementSelectionChange(use, event.target.value)} disabled={!editable}>
                      {!value && <option value="">Select cement</option>}
                      {variants.map(rate => <option key={rate.key} value={rate.variant}>{rate.label}{canViewCost ? ' · ₹' + figure(rate.rate) + '/bag' : ''}</option>)}
                      <option value={CUSTOM_CEMENT_VARIANT}>Custom brand / grade</option>
                    </select>
                  </label>
                  {value === CUSTOM_CEMENT_VARIANT && (
                    <>
                      <label>
                        <span>Custom cement brand and grade</span>
                        <input value={cementSelections[customCementNameKey(use)] ?? ''} maxLength={100} placeholder="e.g. OPC 53 / PPC" onChange={event => onCementSelectionChange(customCementNameKey(use), event.target.value)} disabled={!editable} />
                      </label>
                      {canViewCost && <label>
                        <span>Custom purchase rate (₹/bag)</span>
                        <input type="number" min={0} step="any" value={cementSelections[customCementRateKey(use)] ?? ''} onChange={event => onCementSelectionChange(customCementRateKey(use), event.target.value)} disabled={!editable} />
                      </label>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="boq-rmc-other">
        <div>
          <strong>Other work — unchanged</strong>
          <small>PCC · Sajjas · Shelves · Brickwork · Plaster</small>
        </div>
        {autoSaveLabel && (
          <span className="boq-rmc-autosave" role="status">
            {autoSaveLabel}
          </span>
        )}
      </div>
    </section>
  );
}
