'use client';

import { NumberField } from './boq-number-field';
import type {
  DesignSlabPanel,
  DesignStairType,
} from '@business-os/core/construction-boq';
import type { MeasuredSteelSet } from './boq-stage-measurements';

const DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 40];

function QuantityField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="boq-stage-field">
      <span>
        {label}
        {unit ? ' (' + unit + ')' : ''}
      </span>
      {/* Feet boxes read drawing sizes such as 5'0" (a number box would
          read 5'0" as 50). */}
      <NumberField
        label={label + (unit ? ' (' + unit + ')' : '')}
        value={value}
        min={0}
        feet={unit === 'ft'}
        onChange={onChange}
      />
    </label>
  );
}

const close = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function BoqSlabScheduleEditor({
  floor,
  panels,
  onChange,
}: {
  floor: string;
  panels: readonly DesignSlabPanel[];
  onChange: (panels: DesignSlabPanel[]) => void;
}) {
  const change = (index: number, patch: Partial<DesignSlabPanel>) =>
    onChange(
      panels.map((panel, i) => (i === index ? { ...panel, ...patch } : panel)),
    );
  const total = panels.reduce(
    (sum, panel) => sum + panel.count * panel.lengthFeet * panel.widthFeet,
    0,
  );
  return (
    <div className="boq-structural-schedule">
      {panels.length === 0 && (
        <p className="boq-stage-hint">
          The existing quotation floor slab is retained. Add S1/S2 panels only
          when the structural drawing specifies separate slab dimensions or
          steel.
        </p>
      )}
      {panels.map((panel, i) => {
        const updateSteel = (reinforcement: DesignSlabPanel['reinforcement']) =>
          change(i, { reinforcement });
        return (
          <section className="boq-stage-subcard" key={i}>
            <div className="boq-stage-subhead">
              <strong>{panel.label || 'Slab ' + (i + 1)}</strong>
              <button
                type="button"
                onClick={() => onChange(panels.filter((_, j) => i !== j))}
              >
                Remove
              </button>
            </div>
            <div className="boq-stage-input-grid">
              <label className="boq-stage-field">
                <span>Panel type</span>
                <input
                  value={panel.label}
                  maxLength={40}
                  onChange={(event) => change(i, { label: event.target.value })}
                />
              </label>
              <QuantityField
                label="Identical panels"
                value={panel.count}
                onChange={(count) => change(i, { count: Math.round(count) })}
              />
              <QuantityField
                label="Each length"
                unit="ft"
                value={panel.lengthFeet}
                onChange={(lengthFeet) => change(i, { lengthFeet })}
              />
              <QuantityField
                label="Each width"
                unit="ft"
                value={panel.widthFeet}
                onChange={(widthFeet) => change(i, { widthFeet })}
              />
              <QuantityField
                label="Slab thickness"
                unit="in"
                value={panel.thicknessIn}
                onChange={(thicknessIn) => change(i, { thicknessIn })}
              />
            </div>
            <div className="boq-structural-rebar-heading">
              Reinforcement layers from drawing
            </div>
            {panel.reinforcement.map((bar, j) => (
              <div className="boq-structural-rebar-row" key={j}>
                <label>
                  Layer
                  <select
                    value={bar.layer}
                    onChange={(event) =>
                      updateSteel(
                        panel.reinforcement.map((row, k) =>
                          j === k
                            ? {
                                ...row,
                                layer:
                                  event.target.value === 'top'
                                    ? 'top'
                                    : 'bottom',
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                  </select>
                </label>
                <label>
                  Runs
                  <select
                    value={bar.direction}
                    onChange={(event) =>
                      updateSteel(
                        panel.reinforcement.map((row, k) =>
                          j === k
                            ? {
                                ...row,
                                direction:
                                  event.target.value === 'width'
                                    ? 'width'
                                    : 'length',
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="length">Along length</option>
                    <option value="width">Along width</option>
                  </select>
                </label>
                <label>
                  Diameter (mm)
                  <select
                    value={bar.dia}
                    onChange={(event) =>
                      updateSteel(
                        panel.reinforcement.map((row, k) =>
                          j === k
                            ? { ...row, dia: Number(event.target.value) }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="0">Select</option>
                    {DIAMETERS.map((dia) => (
                      <option key={dia} value={dia}>
                        {dia} mm
                      </option>
                    ))}
                  </select>
                </label>
                <QuantityField
                  label="Spacing"
                  unit="in"
                  value={bar.spacingIn}
                  onChange={(spacingIn) =>
                    updateSteel(
                      panel.reinforcement.map((row, k) =>
                        j === k ? { ...row, spacingIn } : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={'Remove slab reinforcement row ' + (j + 1)}
                  onClick={() =>
                    updateSteel(panel.reinforcement.filter((_, k) => j !== k))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="boq-stage-outline"
              disabled={panel.reinforcement.length >= 16}
              onClick={() =>
                updateSteel([
                  ...panel.reinforcement,
                  {
                    layer: 'bottom',
                    direction: 'length',
                    dia: 0,
                    spacingIn: 0,
                  },
                ])
              }
            >
              + Add rod layer
            </button>
            {!panel.reinforcement.length && (
              <small className="boq-structural-warning">
                No rods entered — steel is not assumed.
              </small>
            )}
            <div className="boq-stage-volume">
              <span>
                {close(panel.count * panel.lengthFeet * panel.widthFeet)} sq ft
              </span>
              <strong>
                {close(
                  ((panel.count *
                    panel.lengthFeet *
                    panel.widthFeet *
                    panel.thicknessIn) /
                    12) *
                    0.028316846592,
                )}{' '}
                m³
              </strong>
            </div>
          </section>
        );
      })}
      {panels.length > 0 && (
        <small className="boq-structural-note">
          {close(total)} sq ft of slab panels on {floor}. These replace the
          floor-wide slab estimate; panels must not overlap.
        </small>
      )}
      <button
        type="button"
        className="boq-stage-outline"
        disabled={panels.length >= 40}
        onClick={() =>
          onChange([
            ...panels,
            {
              label: 'S' + (panels.length + 1),
              floor,
              count: 1,
              lengthFeet: 0,
              widthFeet: 0,
              thicknessIn: 5,
              reinforcement: [],
            },
          ])
        }
      >
        + Add slab panel type
      </button>
    </div>
  );
}

export function BoqStaircaseScheduleEditor({
  floor,
  stairs,
  onChange,
}: {
  floor: string;
  stairs: readonly DesignStairType[];
  onChange: (stairs: DesignStairType[]) => void;
}) {
  const change = (i: number, patch: Partial<DesignStairType>) =>
    onChange(
      stairs.map((stair, j) => (i === j ? { ...stair, ...patch } : stair)),
    );
  return (
    <div className="boq-structural-schedule">
      {stairs.length === 0 && (
        <p className="boq-stage-hint">
          Existing stair rules are retained. Add ST1/ST2 to measure distinct
          flights, widths and reinforcement layouts for this floor.
        </p>
      )}
      {stairs.map((stair, i) => {
        const updateSteel = (reinforcement: DesignStairType['reinforcement']) =>
          change(i, { reinforcement });
        return (
          <section className="boq-stage-subcard" key={i}>
            <div className="boq-stage-subhead">
              <strong>{stair.label || 'Stair ' + (i + 1)}</strong>
              <button
                type="button"
                onClick={() => onChange(stairs.filter((_, j) => i !== j))}
              >
                Remove
              </button>
            </div>
            <div className="boq-stage-input-grid">
              <label className="boq-stage-field">
                <span>Stair reference</span>
                <input
                  value={stair.label}
                  maxLength={40}
                  onChange={(event) => change(i, { label: event.target.value })}
                />
              </label>
              {(
                [
                  ['count', 'Identical stairs', 'nos'],
                  ['widthFeet', 'Width', 'ft'],
                  ['riserIn', 'Riser', 'in'],
                  ['treadIn', 'Tread', 'in'],
                  ['waistIn', 'Waist slab', 'in'],
                  ['landingFeet', 'Landing length', 'ft'],
                ] as const
              ).map(([key, label, unit]) => (
                <QuantityField
                  key={key}
                  label={label}
                  unit={unit}
                  value={stair[key]}
                  onChange={(value) =>
                    change(i, {
                      [key]: key === 'count' ? Math.round(value) : value,
                    })
                  }
                />
              ))}
            </div>
            <div className="boq-structural-rebar-heading">
              Staircase reinforcement
            </div>
            {stair.reinforcement.map((bar, j) => (
              <div className="boq-structural-rebar-row" key={j}>
                <label>
                  Bars
                  <select
                    value={bar.role}
                    onChange={(event) =>
                      updateSteel(
                        stair.reinforcement.map((r, k) =>
                          j === k
                            ? {
                                ...r,
                                role:
                                  event.target.value === 'distribution'
                                    ? 'distribution'
                                    : 'main',
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="main">Main</option>
                    <option value="distribution">Distribution</option>
                  </select>
                </label>
                <label>
                  Diameter
                  <select
                    value={bar.dia}
                    onChange={(event) =>
                      updateSteel(
                        stair.reinforcement.map((r, k) =>
                          j === k
                            ? { ...r, dia: Number(event.target.value) }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="0">Select</option>
                    {DIAMETERS.map((dia) => (
                      <option key={dia} value={dia}>
                        {dia} mm
                      </option>
                    ))}
                  </select>
                </label>
                <QuantityField
                  label="Spacing"
                  unit="in"
                  value={bar.spacingIn}
                  onChange={(spacingIn) =>
                    updateSteel(
                      stair.reinforcement.map((r, k) =>
                        j === k ? { ...r, spacingIn } : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={'Remove stair rod row ' + (j + 1)}
                  onClick={() =>
                    updateSteel(stair.reinforcement.filter((_, k) => k !== j))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="boq-stage-outline"
              disabled={stair.reinforcement.length >= 16}
              onClick={() =>
                updateSteel([
                  ...stair.reinforcement,
                  { role: 'main', dia: 0, spacingIn: 0 },
                ])
              }
            >
              + Add stair rod set
            </button>
            {!stair.reinforcement.length && (
              <small className="boq-structural-warning">
                No steel assumed until rod sizes and spacings are entered.
              </small>
            )}
          </section>
        );
      })}
      <button
        type="button"
        className="boq-stage-outline"
        disabled={stairs.length >= 30}
        onClick={() =>
          onChange([
            ...stairs,
            {
              label: 'ST' + (stairs.length + 1),
              floor,
              count: 1,
              widthFeet: 0,
              riserIn: 6,
              treadIn: 10,
              waistIn: 6,
              landingFeet: 0,
              reinforcement: [],
            },
          ])
        }
      >
        + Add staircase type
      </button>
    </div>
  );
}

/** Optional measured reinforcement in non-RMC sajjas and RCC shelves. */
export function BoqSmallRccSteelEditor({
  rows,
  onChange,
}: {
  rows: readonly MeasuredSteelSet[];
  onChange: (rows: MeasuredSteelSet[]) => void;
}) {
  const update = (index: number, patch: Partial<MeasuredSteelSet>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <section className="boq-structural-schedule boq-small-rcc-steel">
      <strong className="boq-structural-rebar-heading">
        Optional reinforcement from drawing
      </strong>
      {rows.map((row, i) => (
        <div className="boq-structural-rebar-row" key={i}>
          <label>
            Diameter
            <select
              value={row.dia}
              onChange={(event) =>
                update(i, { dia: Number(event.target.value) })
              }
            >
              <option value={0}>Select</option>
              {DIAMETERS.map((dia) => (
                <option key={dia} value={dia}>
                  {dia} mm
                </option>
              ))}
            </select>
          </label>
          <QuantityField
            label="Bars per item"
            value={row.count}
            onChange={(count) => update(i, { count: Math.round(count) })}
          />
          <QuantityField
            label="Cut length"
            unit="ft"
            value={row.cutLengthFeet}
            onChange={(cutLengthFeet) => update(i, { cutLengthFeet })}
          />
          <button
            type="button"
            aria-label={'Remove small RCC rod row ' + (i + 1)}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="boq-stage-outline"
        disabled={rows.length >= 16}
        onClick={() =>
          onChange([...rows, { dia: 0, count: 0, cutLengthFeet: 0 }])
        }
      >
        + Add rod size
      </button>
      <small className="boq-structural-note">
        Enter only approved bar counts and cut lengths (up to the configured
        stock bar length). Steel is separate from site-mixed cement, sand and
        aggregate.
      </small>
    </section>
  );
}
