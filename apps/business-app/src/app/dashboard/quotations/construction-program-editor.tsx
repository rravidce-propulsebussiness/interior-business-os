'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
  type CompanyConstructionStage,
} from '@business-os/core/company-construction-defaults';
import { savedQuotationConstructionProgram } from '@business-os/core/quotation-construction-program';
import { quotedConstructionFloorCode } from '@business-os/core/construction-floor-code';

type Props = {
  total: string;
  currency: string;
  editable: boolean;
  floorNames: string[];
  companyDefaults: unknown;
  initial: { revision_id: string; terms: string };
};
const codeMap: Record<string, (floor: string) => string[]> = {
  preconstruction: () => ['PRECONSTRUCTION', 'DESIGN'],
  foundation: () => ['SITE_PREP', 'FOUNDATION', 'PLINTH'],
  slabs: (floor) => ['RCC/' + quotedConstructionFloorCode(floor)],
  brickwork: (floor) => ['MASONRY/' + quotedConstructionFloorCode(floor)],
  'electrical-plumbing': (floor) => [
    'INTERNAL_PLASTER/' + quotedConstructionFloorCode(floor),
    'EXTERNAL_PLASTER/' + quotedConstructionFloorCode(floor),
    'PLUMBING_PAINT/' + quotedConstructionFloorCode(floor),
  ],
  tiles: (floor) => ['TILES/' + quotedConstructionFloorCode(floor)],
  painting: (floor) => ['DOORS/' + quotedConstructionFloorCode(floor)],
};
const paymentName: Record<string, string> = {
  preconstruction: 'Price freeze & design payment',
  foundation: 'Foundation payment',
  slabs: 'Slab work payment',
  brickwork: 'Brickwork payment',
  'electrical-plumbing': 'Electrical & plumbing payment',
  tiles: 'Tiles payment',
  painting: 'Painting payment',
};
const dateAt = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number, skipSundays: boolean) => {
  const result = new Date(date);
  let left = Math.max(0, days);
  while (left > 0) {
    result.setDate(result.getDate() + 1);
    if (!skipSundays || result.getDay() !== 0) left--;
  }
  if (skipSundays && result.getDay() === 0)
    result.setDate(result.getDate() + 1);
  return result;
};
const showDate = (date: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

function buildRows(
  stages: CompanyConstructionStage[],
  floorNames: string[],
  startDate: string,
  amount: number,
  skipSundays: boolean,
) {
  let cursor = new Date(startDate + 'T12:00:00');
  if (skipSundays && cursor.getDay() === 0) cursor = addDays(cursor, 0, true);
  return stages.map((stage) => {
    const instances = stage.repeatsPerFloor ? floorNames : [''];
    const eachPercent = Number(stage.percent) / instances.length;
    const floors = instances.map((floorName) => {
      const first = new Date(cursor);
      const stageDays = Math.max(
        stage.days,
        stage.items.reduce((sum, item) => sum + item.days, 0),
      );
      const end = addDays(first, Math.max(0, stageDays - 1), skipSundays);
      let itemCursor = new Date(first);
      const items = stage.items.map((item) => {
        const itemStart = new Date(itemCursor);
        const itemEnd = addDays(
          itemStart,
          Math.max(0, item.days - 1),
          skipSundays,
        );
        itemCursor = addDays(itemEnd, 1, skipSundays);
        return { ...item, start: itemStart, end: itemEnd };
      });
      cursor = addDays(end, 1, skipSundays);
      return {
        floorName,
        percent: eachPercent,
        amount: (amount * eachPercent) / 100,
        start: first,
        end,
        items,
      };
    });
    const stageCodes = [
      ...new Set(
        instances.flatMap((floor) => (codeMap[stage.id] ?? (() => []))(floor)),
      ),
    ];
    return {
      stage,
      floors,
      stageCodes,
      name: paymentName[stage.id] ?? stage.name,
    };
  });
}

export function ConstructionProgramEditor({
  total,
  currency,
  editable,
  floorNames,
  companyDefaults,
  initial,
}: Props) {
  const parsed = companyConstructionStages.safeParse(companyDefaults);
  const defaults = parsed.success
    ? parsed.data
    : defaultCompanyConstructionStages;
  const saved = savedQuotationConstructionProgram(initial.terms);
  const stages: CompanyConstructionStage[] = editable
    ? defaults
    : (saved?.stages ?? defaults);
  const [startDate, setStartDate] = useState(
    saved?.startDate ?? dateAt(new Date()),
  );
  const [skipSundays, setSkipSundays] = useState(saved?.skipSundays ?? true);
  const [feedback, setFeedback] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const lastSubmitted = useRef('');
  const amount = Number(total) || 0;
  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  const rows = buildRows(stages, floorNames, startDate, amount, skipSundays);
  const plannedDays = rows.reduce(
    (sum, row) =>
      sum +
      row.floors.length *
        Math.max(
          row.stage.days,
          row.stage.items.reduce((itemSum, item) => itemSum + item.days, 0),
        ),
    0,
  );
  const targetHandover = rows.at(-1)?.floors.at(-1)?.end;
  const signature = JSON.stringify({
    stages,
    floors: floorNames,
    startDate,
    skipSundays,
  });

  const needsSync =
    !saved ||
    JSON.stringify(saved.stages) !== JSON.stringify(defaults) ||
    JSON.stringify(saved.floors) !== JSON.stringify(floorNames) ||
    saved.startDate !== startDate ||
    saved.skipSundays !== skipSundays;
  useEffect(() => {
    if (
      !editable ||
      !needsSync ||
      !floorNames.length ||
      rows.length !== 7 ||
      lastSubmitted.current === signature
    )
      return;
    lastSubmitted.current = signature;
    start(async () => {
      try {
        const response = await fetch(
          `/dashboard/quotations/${initial.revision_id}/conditions`,
          {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'payments',
              program: {
                stages,
                startDate,
                skipSundays,
                floors: floorNames,
              },
              stages: rows.map((row) => ({
                name: row.name,
                percent: Number(row.stage.percent).toFixed(2),
                stageCodes: row.stageCodes,
              })),
              stageRequirements: {},
              milestoneFlow: {},
            }),
          },
        );
        const result = (await response.json().catch(() => null)) as {
          id?: string;
          message?: string;
        } | null;
        if (!response.ok || !result?.id) {
          setFeedback(
            result?.message ??
              'Could not save the Settings stage programme to this quotation.',
          );
          return;
        }
        setFeedback(
          'Payment stages and work dates saved from Company Settings.',
        );
        router.refresh();
      } catch {
        setFeedback('Network error saving the construction programme.');
      }
    });
  }, [
    editable,
    floorNames,
    initial.revision_id,
    needsSync,
    router,
    rows,
    signature,
    skipSundays,
    stages,
    startDate,
    start,
  ]);

  if (floorNames.length === 0)
    return (
      <section
        className="qs-card qs-construction-program"
        data-studio-save="payments"
      >
        <h2>Payments & Work</h2>
        <p>
          Add the quoted floor schedule first. Floor stages and their dates are
          generated from that list.
        </p>
      </section>
    );

  return (
    <section
      className="qs-card qs-construction-program"
      data-studio-save="payments"
    >
      <header className="qs-program-header">
        <div>
          <h2>Payments & Work</h2>
          <p>
            Payments and work are synced from Company Settings. No quotation
            edits are needed; floor stages and target dates are calculated
            automatically from this programme.
          </p>
        </div>
        <div className="qs-program-start">
          <label htmlFor="construction-program-start">Project start date</label>
          {editable ? (
            <input
              id="construction-program-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          ) : (
            <strong>{showDate(new Date(startDate + 'T12:00:00'))}</strong>
          )}
        </div>
      </header>
      {feedback && (
        <p role="status" className="qs-program-feedback">
          {feedback}
        </p>
      )}
      <div className="qs-program-list">
        <div className="qs-program-calendar">
          <div>
            <span>Calendar basis</span>
            <strong>{skipSundays ? 'Working days' : 'Calendar days'}</strong>
          </div>
          <label>
            <input
              type="checkbox"
              checked={skipSundays}
              disabled={!editable}
              onChange={(event) => setSkipSundays(event.target.checked)}
            />
            Skip Sundays
          </label>
          <div>
            <span>Schedule duration</span>
            <strong>
              {plannedDays} {skipSundays ? 'working days' : 'calendar days'}
            </strong>
          </div>
          <div>
            <span>Target handover</span>
            <strong>{targetHandover ? showDate(targetHandover) : '—'}</strong>
          </div>
        </div>
        <div className="qs-program-columns">
          <span>Payment / work stage</span>
          <span>Payment share</span>
          <span>Amount</span>
          <span>Planned dates</span>
        </div>
        {rows.map(({ stage, floors, name }, index) => (
          <article className="qs-program-stage" key={stage.id}>
            <div className="qs-program-payment">
              <span className="qs-program-number">{index + 1}</span>
              <div className="qs-program-stage-title">
                <strong>{name}</strong>
                <small>
                  {stage.repeatsPerFloor
                    ? `Repeats for ${floorNames.length} quoted floor${floorNames.length === 1 ? '' : 's'}`
                    : 'One-time stage'}
                </small>
              </div>
              <strong>{stage.percent}%</strong>
              <strong>{fmt((amount * stage.percent) / 100)}</strong>
              <span>
                {showDate(floors[0]!.start)} – {showDate(floors.at(-1)!.end)}
              </span>
            </div>
            <div className="qs-program-work">
              <h3>
                {stage.name} · {stage.days} planned days per stage
              </h3>
              {floors.map((floor, floorIndex) => (
                <section
                  className="qs-program-floor"
                  key={`${stage.id}-${floorIndex}`}
                >
                  <h4>
                    {stage.repeatsPerFloor
                      ? `${floor.floorName} · ${floor.percent.toFixed(2)}% · ${fmt(floor.amount)}`
                      : `${stage.name} · ${fmt(floor.amount)}`}{' '}
                    · {showDate(floor.start)} – {showDate(floor.end)}
                  </h4>
                  {floor.items.length ? (
                    <ol>
                      {floor.items.map((item) => (
                        <li key={item.id}>
                          <div>
                            <span className="qs-program-kind">
                              {item.kind === 'qc'
                                ? 'QC'
                                : item.kind === 'check'
                                  ? 'Site check'
                                  : item.kind}
                            </span>
                            <strong>{item.title}</strong>
                          </div>
                          <span>{item.days} days</span>
                          <small>
                            {showDate(item.start)} – {showDate(item.end)}
                          </small>
                          {item.guideText && <p>{item.guideText}</p>}
                          {item.guideVideoUrl && (
                            <a
                              href={item.guideVideoUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Watch site guide video ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      Work items, checks and site guides are managed in Company
                      Settings.
                    </p>
                  )}
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
      {!editable && !saved && (
        <p className="qs-program-feedback">
          This quotation has no saved Settings programme snapshot.
        </p>
      )}
      {pending && <p className="qs-note">Saving quotation schedule…</p>}
    </section>
  );
}
