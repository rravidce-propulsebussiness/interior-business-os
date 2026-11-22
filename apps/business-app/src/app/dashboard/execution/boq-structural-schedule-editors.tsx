'use client';

import type {
  DesignSlabPanel,
  DesignStairType,
} from '@business-os/core/construction-boq';

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
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
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
          The quotation's existing floor slab is retained. Add S1/S2 panels only
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
