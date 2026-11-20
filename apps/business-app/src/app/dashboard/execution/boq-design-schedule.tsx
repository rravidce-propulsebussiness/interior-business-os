'use client';

import {
  DESIGN_SETTING_KEYS,
  parseBars,
  STRUCTURAL_FIELDS,
  type DesignSettingKey,
  type BoqFloor,
  type DesignBeamType,
  type DesignColumnType,
  type StructuralDesign,
} from '@business-os/core/construction-boq';

const newColumn = (index: number): DesignColumnType => ({
  label: `C${index + 1}`,
  count: 4,
  floors: 0,
  widthIn: 9,
  depthIn: 12,
  bars: '4-12',
  tieDia: 8,
  tieSpacingIn: 6,
  footingLengthFeet: 5,
  footingWidthFeet: 5,
  footingThicknessIn: 12,
  footingBarDia: 12,
  footingBarSpacingIn: 6,
});
const newBeam = (index: number, floors: number): DesignBeamType => ({
  label: `B${index + 1}`,
  widthIn: 9,
  depthIn: 15,
  bars: '2-16+2-12',
  stirrupDia: 8,
  stirrupSpacingIn: 6,
  runFeet: Array.from({ length: floors }, () => 0),
});
export const emptyDesign = (floors: number): StructuralDesign => ({
  columns: [newColumn(0)],
  beams: [newBeam(0, floors)],
  plinthRunFeet: 0,
});

function NumberCell({
  value,
  label,
  onChange,
  step = 1,
  min = 0,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      aria-label={label}
      value={value}
      onChange={(event) =>
        onChange(Math.max(min, Number(event.target.value) || 0))
      }
    />
  );
}

/**
 * Column, footing and beam schedule from the structural drawing. When it is
 * on, footings, column lifts and beams are quantified type by type instead of
 * from the company's column-grid rules.
 */
const BAR_DIAMETERS = [8, 10, 12, 16, 20, 25, 32] as const;
const BAR_COUNTS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Bars as on the drawing, picked as "4 nos × 16 mm" rows (no typing). */
function BarsPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (bars: string) => void;
}) {
  const sets = parseBars(value);
  const rows = sets.length ? sets : [{ count: 4, dia: 12 }];
  const save = (next: { count: number; dia: number }[]) =>
    onChange(next.map((bar) => `${bar.count}-${bar.dia}`).join('+'));
  return (
    <div className="boq-bars">
      {rows.map((bar, index) => (
        <span key={index} className="boq-bars-row">
          <select
            aria-label={`${label} set ${index + 1} number of bars`}
            value={bar.count}
            onChange={(event) =>
              save(
                rows.map((item, i) =>
                  i === index
                    ? { ...item, count: Number(event.target.value) }
                    : item,
                ),
              )
            }
          >
            {BAR_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count} nos
              </option>
            ))}
          </select>
          ×
          <select
            aria-label={`${label} set ${index + 1} bar diameter`}
            value={bar.dia}
            onChange={(event) =>
              save(
                rows.map((item, i) =>
                  i === index
                    ? { ...item, dia: Number(event.target.value) }
                    : item,
                ),
              )
            }
          >
            {BAR_DIAMETERS.map((dia) => (
              <option key={dia} value={dia}>
                {dia} mm
              </option>
            ))}
          </select>
          {rows.length > 1 && (
            <button
              type="button"
              className="erp-button erp-button-quiet"
              aria-label={`Remove ${label} set ${index + 1}`}
              onClick={() => save(rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {rows.length < 4 && (
        <button
          type="button"
          className="erp-button erp-button-quiet"
          onClick={() => save([...rows, { count: 2, dia: 12 }])}
        >
          + bars
        </button>
      )}
    </div>
  );
}

const DESIGN_FIELDS = DESIGN_SETTING_KEYS.map((key) =>
  STRUCTURAL_FIELDS.find((field) => field.key === key)!,
).filter(Boolean);

export function BoqDesignSchedule({
  design,
  floors,
  defaults,
  onChange,
}: {
  design: StructuralDesign | null;
  floors: readonly BoqFloor[];
  /** Company structural rules, shown until the drawing's value is typed. */
  defaults: Readonly<Record<string, number>>;
  onChange: (design: StructuralDesign | null) => void;
}) {
  const on = Boolean(design);
  const updateColumn = (index: number, patch: Partial<DesignColumnType>) =>
    design &&
    onChange({
      ...design,
      columns: design.columns.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  const updateBeam = (index: number, patch: Partial<DesignBeamType>) =>
    design &&
    onChange({
      ...design,
      beams: design.beams.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });

  return (
    <div className="boq-design">
      <label className="boq-design-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) =>
            onChange(event.target.checked ? emptyDesign(floors.length) : null)
          }
        />
        <span>
          <strong>Use the structural drawing</strong>
          <small>
            Enter each column type (with its footing) and beam type from the
            engineer&apos;s drawing. Steel is then quantified type by type. Off:
            the column grid and bar rules from Configure rates are used.
          </small>
        </span>
      </label>
      {design && (
        <>
          <div className="boq-gen-count-table boq-design-table">
            <table>
              <caption>Columns and footings</caption>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Nos</th>
                  <th>Rises to</th>
                  <th>Size (in)</th>
                  <th>Main bars (nos-dia)</th>
                  <th>Rings (mm @ in)</th>
                  <th>Footing L × W (ft) × T (in)</th>
                  <th>Footing mesh (mm @ in)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {design.columns.map((column, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        aria-label="Column type"
                        value={column.label}
                        maxLength={40}
                        onChange={(event) =>
                          updateColumn(index, { label: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <NumberCell
                        label={`${column.label} number of columns`}
                        value={column.count}
                        onChange={(count) =>
                          updateColumn(index, { count: Math.round(count) })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${column.label} rises to`}
                        value={column.floors}
                        onChange={(event) =>
                          updateColumn(index, {
                            floors: Number(event.target.value),
                          })
                        }
                      >
                        <option value={0}>Top floor</option>
                        {floors.slice(0, -1).map((floor, i) => (
                          <option key={floor.name} value={i + 1}>
                            {floor.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${column.label} width`}
                        value={column.widthIn}
                        onChange={(widthIn) => updateColumn(index, { widthIn })}
                      />
                      <NumberCell
                        label={`${column.label} depth`}
                        value={column.depthIn}
                        onChange={(depthIn) => updateColumn(index, { depthIn })}
                      />
                    </td>
                    <td>
                      <BarsPicker
                        label={`${column.label} main bars`}
                        value={column.bars}
                        onChange={(bars) => updateColumn(index, { bars })}
                      />
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${column.label} ring diameter`}
                        value={column.tieDia}
                        onChange={(tieDia) => updateColumn(index, { tieDia })}
                      />
                      <NumberCell
                        label={`${column.label} ring spacing`}
                        value={column.tieSpacingIn}
                        onChange={(tieSpacingIn) =>
                          updateColumn(index, { tieSpacingIn })
                        }
                      />
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${column.label} footing length`}
                        step={0.25}
                        value={column.footingLengthFeet}
                        onChange={(footingLengthFeet) =>
                          updateColumn(index, { footingLengthFeet })
                        }
                      />
                      <NumberCell
                        label={`${column.label} footing width`}
                        step={0.25}
                        value={column.footingWidthFeet}
                        onChange={(footingWidthFeet) =>
                          updateColumn(index, { footingWidthFeet })
                        }
                      />
                      <NumberCell
                        label={`${column.label} footing thickness`}
                        value={column.footingThicknessIn}
                        onChange={(footingThicknessIn) =>
                          updateColumn(index, { footingThicknessIn })
                        }
                      />
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${column.label} footing bar diameter`}
                        value={column.footingBarDia}
                        onChange={(footingBarDia) =>
                          updateColumn(index, { footingBarDia })
                        }
                      />
                      <NumberCell
                        label={`${column.label} footing bar spacing`}
                        value={column.footingBarSpacingIn}
                        onChange={(footingBarSpacingIn) =>
                          updateColumn(index, { footingBarSpacingIn })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="erp-button erp-button-quiet"
                        aria-label={`Remove ${column.label}`}
                        onClick={() =>
                          onChange({
                            ...design,
                            columns: design.columns.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="erp-button erp-button-quiet"
              onClick={() =>
                onChange({
                  ...design,
                  columns: [
                    ...design.columns,
                    newColumn(design.columns.length),
                  ],
                })
              }
            >
              + Column type
            </button>
          </div>
          <div className="boq-gen-count-table boq-design-table">
            <table>
              <caption>Beams: running feet under each roof</caption>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Size (in)</th>
                  <th>Main bars (nos-dia)</th>
                  <th>Stirrups (mm @ in)</th>
                  {floors.map((floor) => (
                    <th key={floor.name}>{floor.name} (ft)</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {design.beams.map((beam, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        aria-label="Beam type"
                        value={beam.label}
                        maxLength={40}
                        onChange={(event) =>
                          updateBeam(index, { label: event.target.value })
                        }
                      />
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${beam.label} width`}
                        value={beam.widthIn}
                        onChange={(widthIn) => updateBeam(index, { widthIn })}
                      />
                      <NumberCell
                        label={`${beam.label} depth`}
                        value={beam.depthIn}
                        onChange={(depthIn) => updateBeam(index, { depthIn })}
                      />
                    </td>
                    <td>
                      <BarsPicker
                        label={`${beam.label} main bars`}
                        value={beam.bars}
                        onChange={(bars) => updateBeam(index, { bars })}
                      />
                    </td>
                    <td className="boq-design-pair">
                      <NumberCell
                        label={`${beam.label} stirrup diameter`}
                        value={beam.stirrupDia}
                        onChange={(stirrupDia) =>
                          updateBeam(index, { stirrupDia })
                        }
                      />
                      <NumberCell
                        label={`${beam.label} stirrup spacing`}
                        value={beam.stirrupSpacingIn}
                        onChange={(stirrupSpacingIn) =>
                          updateBeam(index, { stirrupSpacingIn })
                        }
                      />
                    </td>
                    {floors.map((floor, floorIndex) => (
                      <td key={floor.name}>
                        <NumberCell
                          label={`${beam.label} running feet under ${floor.name} roof`}
                          value={beam.runFeet[floorIndex] ?? 0}
                          onChange={(run) =>
                            updateBeam(index, {
                              runFeet: floors.map((_, i) =>
                                i === floorIndex ? run : (beam.runFeet[i] ?? 0),
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="erp-button erp-button-quiet"
                        aria-label={`Remove ${beam.label}`}
                        onClick={() =>
                          onChange({
                            ...design,
                            beams: design.beams.filter((_, i) => i !== index),
                          })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="boq-design-rules">
              <strong>
                Slab, plinth beam, staircase and covers on this drawing
              </strong>
              <div>
                {DESIGN_FIELDS.map((field) => {
                  const key = field.key as DesignSettingKey;
                  return (
                    <label key={key}>
                      {field.label}
                      <input
                        type="number"
                        step="any"
                        min={field.min}
                        max={field.max}
                        value={
                          design.settings?.[key] ?? defaults[key] ?? field.value
                        }
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          onChange({
                            ...design,
                            settings: {
                              ...design.settings,
                              [key]: Number.isFinite(value)
                                ? value
                                : field.value,
                            },
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="boq-design-foot">
              <button
                type="button"
                className="erp-button erp-button-quiet"
                onClick={() =>
                  onChange({
                    ...design,
                    beams: [
                      ...design.beams,
                      newBeam(design.beams.length, floors.length),
                    ],
                  })
                }
              >
                + Beam type
              </button>
              <label>
                Plinth beam running ft (0 = from the column grid)
                <NumberCell
                  label="Plinth beam running feet"
                  value={design.plinthRunFeet}
                  onChange={(plinthRunFeet) =>
                    onChange({ ...design, plinthRunFeet })
                  }
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
