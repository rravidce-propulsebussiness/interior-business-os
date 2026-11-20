'use client';

import {
  FLOOR_COUNT_FIELDS,
  FLOOR_COUNT_GROUPS,
  parseOpenings,
  type BoqCounts,
  type BoqFloor,
  type FloorCounts,
  type FloorFinishes,
} from '@business-os/core/construction-boq';

const emptyFinishes = (): FloorFinishes => ({
  rooms: [],
  bathroomLengthFeet: 0,
  bathroomWidthFeet: 0,
  kitchenPlatformFeet: 0,
});
const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

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
    value: string,
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
          [key]: Math.max(0, Math.round(Number(value) || 0)),
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
                      <th>Bathroom size L × W (ft)</th>
                      <th>Kitchen platform length (ft)</th>
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
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`${floor.name} ${label}`}
                            value={row[key]}
                            onChange={(event) =>
                              setCount(floor.name, key, event.target.value)
                            }
                          />
                        </td>
                      ))}
                      {group === 'Doors & windows' && (
                        <td className="boq-window-sizes">
                          <input
                            type="text"
                            placeholder="2×4×4, 2×4×6"
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
                          <td className="boq-size-pair">
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              aria-label={`${floor.name} bathroom length`}
                              placeholder={String(
                                defaults.bathroomLengthFeet ?? 7,
                              )}
                              value={finishes.bathroomLengthFeet || ''}
                              onChange={(event) =>
                                setFinishes(floor.name, {
                                  bathroomLengthFeet: toNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                            />
                            ×
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              aria-label={`${floor.name} bathroom width`}
                              placeholder={String(
                                defaults.bathroomWidthFeet ?? 5,
                              )}
                              value={finishes.bathroomWidthFeet || ''}
                              onChange={(event) =>
                                setFinishes(floor.name, {
                                  bathroomWidthFeet: toNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              aria-label={`${floor.name} kitchen platform length`}
                              placeholder={String(
                                defaults.kitchenPlatformFeet ?? 10,
                              )}
                              value={finishes.kitchenPlatformFeet || ''}
                              onChange={(event) =>
                                setFinishes(floor.name, {
                                  kitchenPlatformFeet: toNumber(
                                    event.target.value,
                                  ),
                                })
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
        <p>
          Enter each room&apos;s size to order the exact number of tiles. Floors
          without rooms use an estimate from the built-up area. Bathrooms,
          kitchen platform, staircase and parking are measured above.
        </p>
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
                    ? `${finishes.rooms.length} rooms · ${area.toLocaleString('en-IN', { maximumFractionDigits: 1 })} sq ft`
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
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            aria-label={`${room.name || 'Room'} length`}
                            value={room.lengthFeet || ''}
                            onChange={(event) =>
                              update({
                                lengthFeet: toNumber(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            aria-label={`${room.name || 'Room'} width`}
                            value={room.widthFeet || ''}
                            onChange={(event) =>
                              update({
                                widthFeet: toNumber(event.target.value),
                              })
                            }
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
