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
const addWorkingDays = (date: Date, days: number) => {
  const result = new Date(date);
  let left = Math.max(0, days);
  while (left > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0) left--;
  }
  if (result.getDay() === 0) result.setDate(result.getDate() + 1);
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
) {
  let cursor = new Date(startDate + 'T12:00:00');
  if (cursor.getDay() === 0) cursor = addWorkingDays(cursor, 0);
  return stages.map((stage) => {
    const instances = stage.repeatsPerFloor ? floorNames : [''];
    const eachPercent = Number(stage.percent) / instances.length;
    const floors = instances.map((floorName) => {
      const first = new Date(cursor);
      const stageDays = Math.max(
        stage.days,
        stage.items.reduce((sum, item) => sum + item.days, 0),
      );
      const end = addWorkingDays(first, Math.max(0, stageDays - 1));
      let itemCursor = new Date(first);
      const items = stage.items.map((item) => {
        const itemStart = new Date(itemCursor);
        const itemEnd = addWorkingDays(itemStart, Math.max(0, item.days - 1));
        itemCursor = addWorkingDays(itemEnd, 1);
        return { ...item, start: itemStart, end: itemEnd };
      });
      cursor = addWorkingDays(end, 1);
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
  const startDate = saved?.startDate ?? dateAt(new Date());
  const [feedback, setFeedback] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const attempted = useRef(false);
  const amount = Number(total) || 0;
  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  const rows = buildRows(stages, floorNames, startDate, amount);

  const needsSync =
    !saved ||
    JSON.stringify(saved.stages) !== JSON.stringify(defaults) ||
    JSON.stringify(saved.floors) !== JSON.stringify(floorNames);
  useEffect(() => {
    if (
      !editable ||
      !needsSync ||
      !floorNames.length ||
      rows.length !== 7 ||
      attempted.current
    )
      return;
    attempted.current = true;
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
              program: { stages, startDate, floors: floorNames },
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
  });

  if (floorNames.length === 0)
    return (
      <section className="qs-card qs-construction-program">
        <h2>Payments & Work</h2>
        <p>
          Add the quoted floor schedule first. Floor stages and their dates are
          generated from that list.
        </p>
      </section>
    );

  return (
    <section className="qs-card qs-construction-program">
      <header className="qs-program-header">
        <div>
          <h2>Payments & Work</h2>
          <p>
            These stages come from Company Settings. Floor stages repeat
            automatically, and dates follow the planned working days.
          </p>
        </div>
        <div className="qs-program-start">
          <span>Planned start</span>
          <strong>{showDate(new Date(startDate + 'T12:00:00'))}</strong>
        </div>
      </header>
      {feedback && (
        <p role="status" className="qs-program-feedback">
          {feedback}
        </p>
      )}
      <div className="qs-program-list">
        <div className="qs-program-columns">
          <span>Payment milestone & work</span>
          <span>Share</span>
          <span>Estimated amount</span>
          <span>Target dates</span>
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
                  {stage.repeatsPerFloor && (
                    <h4>
                      {floor.floorName} · {floor.percent.toFixed(2)}% ·{' '}
                      {fmt(floor.amount)} · {showDate(floor.start)} –{' '}
                      {showDate(floor.end)}
                    </h4>
                  )}
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
                          <span>
                            {item.days} days · {showDate(item.start)} –{' '}
                            {showDate(item.end)}
                          </span>
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
