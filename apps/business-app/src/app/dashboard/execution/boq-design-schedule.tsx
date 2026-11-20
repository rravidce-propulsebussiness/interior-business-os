'use client';

import {
  parseBars,
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
export function BoqDesignSchedule({
  design,
  floors,
  onChange,
}: {
  design: StructuralDesign | null;
  floors: readonly BoqFloor[];
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
  const badBars = (text: string) => !parseBars(text).length;

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
                      <input
                        aria-label={`${column.label} main bars`}
                        aria-invalid={badBars(column.bars)}
                        placeholder="4-16+2-12"
                        value={column.bars}
                        maxLength={60}
                        onChange={(event) =>
                          updateColumn(index, { bars: event.target.value })
                        }
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
                      <input
                        aria-label={`${beam.label} main bars`}
                        aria-invalid={badBars(beam.bars)}
                        placeholder="4-20+2-16"
                        value={beam.bars}
                        maxLength={60}
                        onChange={(event) =>
                          updateBeam(index, { bars: event.target.value })
                        }
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
