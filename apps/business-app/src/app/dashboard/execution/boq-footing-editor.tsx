'use client';

import type { ReactNode } from 'react';

import {
  BoqAdvanced,
  BoqRemove,
  editorUnit,
  useBoqEditorUnit,
} from './boq-compact-editor';
import { NumberField } from './boq-number-field';
import {
  FOOTING_TYPES,
  newFootingType,
  type DesignFootingType,
  type FootingRebarSet,
} from '@business-os/core/construction-boq';

type Props = {
  unitControl?: ReactNode;
  footings: DesignFootingType[];
  columnLabels: string[];
  onChange: (footings: DesignFootingType[]) => void;
};
const labels: Record<DesignFootingType['type'], string> = {
  isolated: 'Isolated — single-column',
  combined: 'Combined — two or more columns',
  strap: 'Strap — two pads and connecting beam',
  raft: 'Raft / mat — common foundation slab',
  strip: 'Strip / continuous footing',
  pile_cap: 'Pile cap — cap only, excludes piles',
};
function Numeric({
  label,
  value,
  onChange,
  unit,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  min?: number;
}) {
  const selected = useBoqEditorUnit();
  const display = editorUnit(unit, selected);
  return (
    <label className="boq-stage-field">
      <span>
        {label}
        {display.unit ? ` (${display.unit})` : ''}
      </span>
      {/* Feet boxes read drawing sizes such as 5'0" (a number box would
          read 5'0" as 50). */}
      <NumberField
        key={display.unit}
        label={label + (display.unit ? ' (' + display.unit + ')' : '')}
        value={Number((value * display.factor).toFixed(6))}
        min={min * display.factor}
        feet={display.unit === 'ft'}
        onChange={(n) => onChange(n / display.factor)}
      />
    </label>
  );
}
export function BoqFootingEditor({
  footings,
  columnLabels,
  onChange,
  unitControl,
}: Props) {
  const change = (index: number, patch: Partial<DesignFootingType>) =>
    onChange(
      footings.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  return (
    <div className="boq-footing-editor boq-compact-schedule">
      <div
        className={unitControl ? 'boq-volume-toolbar' : 'boq-compact-actions'}
      >
        {unitControl}
        <button
          className="boq-volume-add"
          type="button"
          onClick={() =>
            onChange([...footings, newFootingType(footings.length)])
          }
        >
          + Add footing type
        </button>
      </div>
      {footings.map((f, fi) => {
        const patch = (entry: Partial<DesignFootingType>) => change(fi, entry);
        const padUnits = f.type === 'strap' ? Math.max(2, f.padsPerGroup) : 1;
        return (
          <div className="boq-stage-subcard boq-footing-type" key={fi}>
            <div className="boq-stage-subhead">
              <strong>{f.label || `Footing ${fi + 1}`}</strong>
              <BoqRemove
                label={`Remove footing ${fi + 1}`}
                onClick={() => onChange(footings.filter((_, i) => i !== fi))}
              />
            </div>
            <div className="boq-stage-input-grid">
              <label className="boq-stage-field">
                <span>Footing reference</span>
                <input
                  value={f.label}
                  maxLength={40}
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </label>
              <label className="boq-stage-field">
                <span>Foundation configuration</span>
                <select
                  value={f.type}
                  onChange={(e) => {
                    const type = e.target.value as DesignFootingType['type'];
                    patch({ type, padsPerGroup: type === 'strap' ? 2 : 1 });
                  }}
                >
                  {FOOTING_TYPES.map((type) => (
                    <option value={type} key={type}>
                      {labels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <Numeric
                label="Same footing groups"
                unit="nos"
                value={f.count}
                onChange={(count) => patch({ count: Math.round(count) })}
              />
              <label className="boq-stage-field">
                <span>Supported column IDs</span>
                <input
                  value={f.columnRefs}
                  placeholder="e.g. C1, C2"
                  onChange={(e) => patch({ columnRefs: e.target.value })}
                />
              </label>
            </div>
            {columnLabels.length > 0 && (
              <p className="boq-footing-helper">
                Columns: {columnLabels.join(', ')}.
              </p>
            )}
            <div className="boq-stage-input-grid">
              {f.type === 'strap' && (
                <Numeric
                  label="Pads per strap group"
                  unit="nos"
                  value={padUnits}
                  min={2}
                  onChange={(padsPerGroup) =>
                    patch({
                      padsPerGroup: Math.round(padsPerGroup),
                    })
                  }
                />
              )}
              <Numeric
                label={
                  f.type === 'strap' ? 'Each pad length' : 'Footing length'
                }
                unit="ft"
                value={f.lengthFeet}
                onChange={(lengthFeet) => patch({ lengthFeet })}
              />
              <Numeric
                label={f.type === 'strap' ? 'Each pad width' : 'Footing width'}
                unit="ft"
                value={f.widthFeet}
                onChange={(widthFeet) => patch({ widthFeet })}
              />
              <Numeric
                label="Footing thickness / centre depth"
                unit="in"
                value={f.thicknessIn}
                onChange={(thicknessIn) => patch({ thicknessIn })}
              />
              <label className="boq-stage-field">
                <span>Concrete geometry</span>
                <select
                  value={f.geometry}
                  onChange={(e) =>
                    patch({
                      geometry: e.target.value as DesignFootingType['geometry'],
                    })
                  }
                >
                  <option value="flat">Flat / uniform thickness</option>
                  <option value="stepped">Stepped footing</option>
                  <option value="sloped">Sloped / tapered footing</option>
                </select>
              </label>
            </div>
            {f.geometry !== 'flat' && (
              <div className="boq-stage-input-grid">
                <Numeric
                  label={
                    f.geometry === 'stepped'
                      ? 'Raised step length'
                      : 'Top length'
                  }
                  unit="ft"
                  value={f.topLengthFeet}
                  onChange={(topLengthFeet) => patch({ topLengthFeet })}
                />
                <Numeric
                  label={
                    f.geometry === 'stepped' ? 'Raised step width' : 'Top width'
                  }
                  unit="ft"
                  value={f.topWidthFeet}
                  onChange={(topWidthFeet) => patch({ topWidthFeet })}
                />
                {f.geometry === 'stepped' ? (
                  <Numeric
                    label="Additional step height"
                    unit="in"
                    value={f.stepThicknessIn}
                    onChange={(stepThicknessIn) => patch({ stepThicknessIn })}
                  />
                ) : (
                  <Numeric
                    label="Minimum edge thickness"
                    unit="in"
                    value={f.edgeThicknessIn}
                    onChange={(edgeThicknessIn) => patch({ edgeThicknessIn })}
                  />
                )}
              </div>
            )}
            {f.type === 'strap' && (
              <>
                <div className="boq-stage-input-grid">
                  <Numeric
                    label="Connecting beam length"
                    unit="ft"
                    value={f.strapLengthFeet}
                    onChange={(strapLengthFeet) => patch({ strapLengthFeet })}
                  />
                  <Numeric
                    label="Connecting beam width"
                    unit="in"
                    value={f.strapWidthIn}
                    onChange={(strapWidthIn) => patch({ strapWidthIn })}
                  />
                  <Numeric
                    label="Connecting beam depth"
                    unit="in"
                    value={f.strapDepthIn}
                    onChange={(strapDepthIn) => patch({ strapDepthIn })}
                  />
                </div>
              </>
            )}
            <BoqAdvanced label="Footing reinforcement (as drawn)">
              <div className="boq-stage-input-grid">
                <label className="boq-stage-field">
                  <span>Bottom bar shape</span>
                  <select value={f.bottomBendIn === undefined ? 'legacy' : f.bottomBendIn === 0 ? 'straight' : 'bent'} onChange={(e) => patch({ bottomBendIn: e.target.value === 'legacy' ? undefined : e.target.value === 'straight' ? 0 : (f.bottomBendIn || 6) })}>
                    <option value="legacy">Full-depth bend (verify drawing)</option>
                    <option value="straight">Straight bars</option>
                    <option value="bent">Custom bend length</option>
                  </select>
                </label>
                {f.bottomBendIn !== undefined && f.bottomBendIn > 0 && <Numeric label="Bottom bend per end" unit="in" value={f.bottomBendIn} onChange={(bottomBendIn) => patch({ bottomBendIn })} />}
                {(f.mesh === 'double' || f.reinforcement?.some(set => set.layer === 'top')) && <Numeric label="Top bend per end" unit="in" value={f.topBendIn ?? 0} onChange={(topBendIn) => patch({ topBendIn })} />}
              </div>
              {!Array.isArray(f.reinforcement) && (
                <div className="boq-stage-input-grid">
                  <label className="boq-stage-field">
                    <span>Reinforcement arrangement</span>
                    <select
                      value={f.mesh}
                      onChange={(e) =>
                        patch({
                          mesh:
                            e.target.value === 'double' ? 'double' : 'single',
                        })
                      }
                    >
                      <option value="single">Single mesh — bottom layer</option>
                      <option value="double">Double mesh — bottom + top</option>
                    </select>
                  </label>
                  <Numeric
                    label="Bottom bar diameter"
                    unit="mm"
                    value={f.bottomBarDia}
                    onChange={(bottomBarDia) => patch({ bottomBarDia })}
                  />
                  <Numeric
                    label="Bottom mesh spacing"
                    unit="in"
                    value={f.bottomSpacingIn}
                    onChange={(bottomSpacingIn) => patch({ bottomSpacingIn })}
                  />
                  {f.mesh === 'double' && (
                    <>
                      <Numeric
                        label="Top bar diameter"
                        unit="mm"
                        value={f.topBarDia}
                        onChange={(topBarDia) => patch({ topBarDia })}
                      />
                      <Numeric
                        label="Top mesh spacing"
                        unit="in"
                        value={f.topSpacingIn}
                        onChange={(topSpacingIn) => patch({ topSpacingIn })}
                      />
                    </>
                  )}
                </div>
              )}
              {Array.isArray(f.reinforcement) && (
                <div className="boq-structural-schedule">
                  {f.reinforcement.map((bar, ri) => {
                    const changeBar = (patchBar: Partial<FootingRebarSet>) =>
                      patch({
                        reinforcement: f.reinforcement!.map((row, i) =>
                          i === ri ? { ...row, ...patchBar } : row,
                        ),
                      });
                    return (
                      <div className="boq-structural-rebar-row" key={ri}>
                        <label>
                          Layer
                          <select
                            value={bar.layer}
                            onChange={(event) =>
                              changeBar({
                                layer:
                                  event.target.value === 'top'
                                    ? 'top'
                                    : 'bottom',
                              })
                            }
                          >
                            <option value="bottom">Bottom</option>
                            <option value="top">Top</option>
                          </select>
                        </label>
                        <label>
                          Direction
                          <select
                            value={bar.direction}
                            onChange={(event) =>
                              changeBar({
                                direction:
                                  event.target.value === 'width'
                                    ? 'width'
                                    : 'length',
                              })
                            }
                          >
                            <option value="length">Along length</option>
                            <option value="width">Along width</option>
                          </select>
                        </label>
                        <label>
                          Diameter
                          <select
                            value={bar.dia}
                            onChange={(event) =>
                              changeBar({ dia: Number(event.target.value) })
                            }
                          >
                            <option value={0}>Select</option>
                            {[6, 8, 10, 12, 16, 20, 25, 32, 40].map((dia) => (
                              <option value={dia} key={dia}>
                                {dia} mm
                              </option>
                            ))}
                          </select>
                        </label>
                        <Numeric
                          label="Spacing"
                          unit="in"
                          value={bar.spacingIn}
                          onChange={(spacingIn) => changeBar({ spacingIn })}
                        />
                        <button
                          type="button"
                          aria-label={`Remove mesh rod row ${ri + 1}`}
                          onClick={() =>
                            patch({
                              reinforcement: f.reinforcement!.filter(
                                (_, i) => i !== ri,
                              ),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="boq-stage-outline"
                    disabled={f.reinforcement.length >= 16}
                    onClick={() =>
                      patch({
                        reinforcement: [
                          ...f.reinforcement!,
                          {
                            layer: 'bottom',
                            direction: 'length',
                            dia: 0,
                            spacingIn: 0,
                          },
                        ],
                      })
                    }
                  >
                    + Add mesh rod size
                  </button>
                  {!f.reinforcement.length && (
                    <small className="boq-structural-warning">
                      No mesh reinforcement assumed until rod sizes are entered.
                    </small>
                  )}
                  <button
                    type="button"
                    className="boq-stage-outline"
                    onClick={() => patch({ reinforcement: undefined })}
                  >
                    Restore previous mesh method
                  </button>
                </div>
              )}
              {!Array.isArray(f.reinforcement) && (
                <button
                  type="button"
                  className="boq-stage-outline"
                  onClick={() =>
                    patch({
                      reinforcement: [
                        {
                          layer: 'bottom',
                          direction: 'length',
                          dia: f.bottomBarDia,
                          spacingIn: f.bottomSpacingIn,
                        },
                        {
                          layer: 'bottom',
                          direction: 'width',
                          dia: f.bottomBarDia,
                          spacingIn: f.bottomSpacingIn,
                        },
                        ...(f.mesh === 'double'
                          ? [
                              {
                                layer: 'top' as const,
                                direction: 'length' as const,
                                dia: f.topBarDia,
                                spacingIn: f.topSpacingIn,
                              },
                              {
                                layer: 'top' as const,
                                direction: 'width' as const,
                                dia: f.topBarDia,
                                spacingIn: f.topSpacingIn,
                              },
                            ]
                          : []),
                      ],
                    })
                  }
                >
                  Customize mesh steel by diameter and direction
                </button>
              )}
            </BoqAdvanced>
            <label className="boq-footing-pedestal-toggle">
              <input
                type="checkbox"
                checked={f.pedestal}
                onChange={(e) => patch({ pedestal: e.target.checked })}
              />
              Include RCC pedestal with this footing
            </label>
            {f.pedestal && (
              <div className="boq-stage-input-grid">
                <Numeric
                  label="Pedestals per group"
                  unit="nos"
                  value={f.pedestalsPerGroup}
                  onChange={(pedestalsPerGroup) =>
                    patch({ pedestalsPerGroup: Math.round(pedestalsPerGroup) })
                  }
                />
                <Numeric
                  label="Pedestal width"
                  unit="in"
                  value={f.pedestalWidthIn}
                  onChange={(pedestalWidthIn) => patch({ pedestalWidthIn })}
                />
                <Numeric
                  label="Pedestal depth"
                  unit="in"
                  value={f.pedestalDepthIn}
                  onChange={(pedestalDepthIn) => patch({ pedestalDepthIn })}
                />
                <Numeric
                  label="Pedestal height"
                  unit="ft"
                  value={f.pedestalHeightFeet}
                  onChange={(pedestalHeightFeet) =>
                    patch({ pedestalHeightFeet })
                  }
                />
                <Numeric
                  label="Pedestal ring diameter"
                  unit="mm"
                  value={f.pedestalTieDia}
                  onChange={(pedestalTieDia) => patch({ pedestalTieDia })}
                />
                <Numeric
                  label="Pedestal ring spacing"
                  unit="in"
                  value={f.pedestalTieSpacingIn}
                  onChange={(pedestalTieSpacingIn) =>
                    patch({ pedestalTieSpacingIn })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
