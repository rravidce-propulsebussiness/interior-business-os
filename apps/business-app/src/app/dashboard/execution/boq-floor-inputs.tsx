'use client';

import {
  FLOOR_COUNT_FIELDS,
  FLOOR_COUNT_GROUPS,
  parseOpenings,
  parseSizes,
  type BoqCounts,
  type BoqFloor,
  type FloorCounts,
  type FloorFinishes,
} from '@business-os/core/construction-boq';
import { NumberField } from './boq-number-field';

const emptyFinishes = (): FloorFinishes => ({
  rooms: [],
  bathroomLengthFeet: 0,
  bathroomWidthFeet: 0,
  kitchenPlatformFeet: 0,
  railingFeet: 0,
});
/** The bathroom sizes as shown in the box: the list, else the typical size. */
const bathroomSizesText = (finishes: FloorFinishes) =>
  finishes.bathroomSizes ??
  (finishes.bathroomLengthFeet && finishes.bathroomWidthFeet
    ? `${finishes.bathroomLengthFeet}×${finishes.bathroomWidthFeet}`
    : '');

/**
 * Everything the BOQ needs per floor, entered by hand from the site or the
 * plan: doors, windows (with sizes), bathrooms and kitchens (with sizes),
 * electrical points, and the rooms to tile.
 */
export function BoqFloorInputs({
  floors,
  counts,
  defaults,
  onChange,
}: {
  floors: readonly BoqFloor[];
  counts: BoqCounts;
  /** Company defaults shown as placeholders. */
  defaults: Readonly<Record<string, number>>;
  onChange: (counts: BoqCounts) => void;
}) {
  const setCount = (
    floor: string,
    key: keyof FloorCounts,
    value: number,
    extra: Partial<BoqCounts> = {},
  ) => {
    const row = counts.floors[floor];
    if (!row) return;
    onChange({
      ...counts,
      ...extra,
      floors: {
        ...counts.floors,
        [floor]: {
          ...row,
          [key]: Math.max(0, Math.round(value || 0)),
        },
      },
    });
  };
  const finishesOf = (floor: string) =>
    counts.finishes?.[floor] ?? emptyFinishes();
  const setFinishes = (floor: string, patch: Partial<FloorFinishes>) =>
    onChange({
      ...counts,
      finishes: {
        ...counts.finishes,
        [floor]: { ...finishesOf(floor), ...patch },
      },
    });

  return (
    <div className="boq-floor-inputs">
      {FLOOR_COUNT_GROUPS.map((group) => {
        const fields = FLOOR_COUNT_FIELDS.filter(
          ([, , fieldGroup]) => fieldGroup === group,
        );
        return (
          <div className="boq-gen-count-table" key={group}>
            <table>
              <caption>{group}</caption>
              <thead>
                <tr>
                  <th>Floor</th>
                  {fields.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                  {group === 'Doors & windows' && (
                    <th>Window sizes (nos × W × H ft)</th>
                  )}
                  {group === 'Bathrooms & kitchens' && (
                    <>
                      <th>Bathroom sizes L × W (ft), one per bathroom</th>
                      <th>Kitchen platform length (ft)</th>
                      <th>Staircase / balcony railing (rft)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {floors.map((floor) => {
                  const row = counts.floors[floor.name];
                  if (!row) return null;
                  const finishes = finishesOf(floor.name);
                  return (
                    <tr key={floor.name}>
                      <th scope="row">{floor.name}</th>
                      {fields.map(([key, label]) => (
                        <td key={key}>
                          <NumberField
                            integer
                            max={500}
                            label={`${floor.name} ${label}`}
                            value={row[key]}
                            onChange={(value) =>
                              setCount(floor.name, key, value)
                            }
                          />
                        </td>
                      ))}
                      {group === 'Doors & windows' && (
                        <td className="boq-window-sizes">
                          <input
                            type="text"
                            placeholder={
                              row.windows ? 'Type sizes, e.g. 2×4×4' : ''
                            }
                            aria-label={`${floor.name} window sizes`}
                            maxLength={200}
                            value={counts.windowSizes?.[floor.name] ?? ''}
                            onChange={(event) => {
                              const text = event.target.value;
                              const openings = parseOpenings(text);
                              const windows = openings.reduce(
                                (sum, opening) => sum + opening.count,
                                0,
                              );
                              onChange({
                                ...counts,
                                windowSizes: {
                                  ...counts.windowSizes,
                                  [floor.name]: text,
                                },
                                floors: {
                                  ...counts.floors,
                                  [floor.name]: {
                                    ...row,
                                    ...(windows ? { windows } : {}),
                                  },
                                },
                              });
                            }}
                          />
                        </td>
                      )}
                      {group === 'Bathrooms & kitchens' && (
                        <>
                          <td className="boq-bath-sizes">
                            <input
                              type="text"
                              maxLength={300}
                              aria-label={`${floor.name} bathroom sizes`}
                              placeholder={
                                row.bathrooms
                                  ? `Typical ${defaults.bathroomLengthFeet ?? 7}×${defaults.bathroomWidthFeet ?? 5} · e.g. 7'0×6'9, 4'6×6'0`
                                  : ''
                              }
                              value={bathroomSizesText(finishes)}
                              onChange={(event) => {
                                const text = event.target.value;
                                const sizes = parseSizes(text);
                                // One size: every bathroom on the floor.
                                // Several: one per bathroom, and the count.
                                const typical =
                                  sizes.length === 1 ? sizes[0]! : null;
                                onChange({
                                  ...counts,
                                  finishes: {
                                    ...counts.finishes,
                                    [floor.name]: {
                                      ...finishes,
                                      bathroomSizes: text,
                                      ...(typical
                                        ? {
                                            bathroomLengthFeet:
                                              typical.lengthFeet,
                                            bathroomWidthFeet:
                                              typical.widthFeet,
                                          }
                                        : !text.trim()
                                          ? {
                                              bathroomLengthFeet: 0,
                                              bathroomWidthFeet: 0,
                                            }
                                          : {}),
                                    },
                                  },
                                  floors: {
                                    ...counts.floors,
                                    [floor.name]: {
                                      ...row,
                                      ...(sizes.length > 1
                                        ? { bathrooms: sizes.length }
                                        : {}),
                                    },
                                  },
                                });
                              }}
                            />
                            {(() => {
                              const sizes = parseSizes(
                                bathroomSizesText(finishes),
                              );
                              return sizes.length > 1 ? (
                                <small>
                                  {sizes
                                    .map(
                                      (size) =>
                                        `${Math.round(size.lengthFeet * 100) / 100}×${Math.round(size.widthFeet * 100) / 100}`,
                                    )
                                    .join(' · ')}{' '}
                                  ft
                                </small>
                              ) : null;
                            })()}
                          </td>
                          <td>
                            <NumberField
                              feet
                              blankZero
                              max={500}
                              label={`${floor.name} kitchen platform length`}
                              placeholder={
                                row.kitchens
                                  ? `Typical ${defaults.kitchenPlatformFeet ?? 10}`
                                  : 'No kitchen'
                              }
                              value={finishes.kitchenPlatformFeet}
                              onChange={(kitchenPlatformFeet) =>
                                setFinishes(floor.name, {
                                  kitchenPlatformFeet,
                                })
                              }
                            />
                          </td>
                          <td>
                            <NumberField
                              feet
                              blankZero
                              max={500}
                              label={`${floor.name} railing running feet`}
                              placeholder="Measure from drawing"
                              value={finishes.railingFeet ?? 0}
                              onChange={(railingFeet) =>
                                setFinishes(floor.name, { railingFeet })
                              }
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="boq-rooms">
        <h4>Rooms to tile (floor tiles + skirting)</h4>
        {floors.map((floor) => {
          const finishes = finishesOf(floor.name);
          const area = finishes.rooms.reduce(
            (sum, room) => sum + room.lengthFeet * room.widthFeet,
            0,
          );
          return (
            <details key={floor.name} className="boq-rooms-floor">
              <summary>
                <strong>{floor.name}</strong>
                <span>
                  {finishes.rooms.length
                    ? `${finishes.rooms.length} ${finishes.rooms.length === 1 ? 'room' : 'rooms'} · ${area.toLocaleString('en-IN', { maximumFractionDigits: 1 })} sq ft`
                    : 'No rooms entered (estimated)'}
                </span>
              </summary>
              <table>
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Length (ft)</th>
                    <th>Width (ft)</th>
                    <th>Area</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {finishes.rooms.map((room, index) => {
                    const update = (patch: Partial<typeof room>) =>
                      setFinishes(floor.name, {
                        rooms: finishes.rooms.map((item, i) =>
                          i === index ? { ...item, ...patch } : item,
                        ),
                      });
                    return (
                      <tr key={index}>
                        <td>
                          <input
                            aria-label="Room name"
                            maxLength={60}
                            value={room.name}
                            placeholder="Bedroom"
                            onChange={(event) =>
                              update({ name: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <NumberField
                            feet
                            blankZero
                            max={500}
                            label={`${room.name || 'Room'} length`}
                            placeholder={`e.g. 11'3"`}
                            value={room.lengthFeet}
                            onChange={(lengthFeet) => update({ lengthFeet })}
                          />
                        </td>
                        <td>
                          <NumberField
                            feet
                            blankZero
                            max={500}
                            label={`${room.name || 'Room'} width`}
                            placeholder={`e.g. 10'7"`}
                            value={room.widthFeet}
                            onChange={(widthFeet) => update({ widthFeet })}
                          />
                        </td>
                        <td>
                          {(room.lengthFeet * room.widthFeet).toLocaleString(
                            'en-IN',
                            { maximumFractionDigits: 1 },
                          )}{' '}
                          sq ft
                        </td>
                        <td>
                          <button
                            type="button"
                            className="erp-button erp-button-quiet"
                            aria-label={`Remove ${room.name || 'room'}`}
                            onClick={() =>
                              setFinishes(floor.name, {
                                rooms: finishes.rooms.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="boq-rooms-add">
                {['Hall', 'Bedroom', 'Kitchen', 'Dining', 'Pooja', 'Room'].map(
                  (name) => (
                    <button
                      key={name}
                      type="button"
                      className="erp-button erp-button-quiet"
                      onClick={() =>
                        setFinishes(floor.name, {
                          rooms: [
                            ...finishes.rooms,
                            { name, lengthFeet: 0, widthFeet: 0 },
                          ].slice(0, 40),
                        })
                      }
                    >
                      + {name}
                    </button>
                  ),
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
