'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  companyConstructionStages,
  defaultCompanyConstructionStages,
  type CompanyConstructionStage,
  type CompanyStageItem,
} from '@business-os/core/company-construction-defaults';
import { savedQuotationConstructionProgram } from '@business-os/core/quotation-construction-program';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import { quotedConstructionFloorCode } from '@business-os/core/construction-floor-code';

type Props = {
  total: string;
  currency: string;
  editable: boolean;
  floorNames: string[];
  companyDefaults: unknown;
  initial: { revision_id: string; terms: string };
  /** Priced, stage-and-floor BOQ allocations, when an authorized pre-quote BOQ exists. */
  boqPaymentAmounts?: Record<string, number>;
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
  preconstruction: 'Design payment',
  foundation: 'Foundation payment',
  slabs: 'Slab payment',
  brickwork: 'Brickwork payment',
  'electrical-plumbing': 'Electrical and plumbing payment',
  tiles: 'Tiles payment',
  painting: 'Painting payment',
};
const dateAt = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
const addWorkingDays = (date: Date, days: number, skipSundays = true) => {
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
export const paymentItemKey = (
  stageId: string,
  floorIndex: number,
  itemId: string,
) => stageId + '|' + floorIndex + '|' + itemId;
const stagePaymentItems = (
  stage: CompanyConstructionStage,
): CompanyStageItem[] => {
  const payments = stage.items.filter((item) => item.kind === 'payment');
  // Legacy templates had no payment marker. Keep their saved payment schedule
  // editable without modifying the company's reusable settings.
  return payments.length
    ? payments
    : [
        {
          id: 'legacy-payment-' + stage.id,
          kind: 'payment',
          title: paymentName[stage.id] ?? 'Payment',
          days: 0,
        },
      ];
};
type AllocatedPayment = {
  key: string;
  name: string;
  stageId: string;
  floorName: string;
  floorIndex: number;
  item: CompanyStageItem;
  amount: number;
  stageCodes: string[];
};

function paymentAllocations(
  stages: CompanyConstructionStage[],
  floorNames: string[],
  values: Record<string, string>,
): AllocatedPayment[] {
  return stages.flatMap((stage) =>
    (stage.repeatsPerFloor ? floorNames : ['']).flatMap(
      (floorName, floorIndex) =>
        stagePaymentItems(stage).map((item) => {
          const key = paymentItemKey(stage.id, floorIndex, item.id);
          const label = [stage.name, floorName, item.title]
            .filter(Boolean)
            .join(' — ');
          return {
            key,
            name: label.slice(0, 100),
            stageId: stage.id,
            floorName,
            floorIndex,
            item,
            amount: Math.max(0, Number(values[key] || 0)),
            stageCodes: (codeMap[stage.id] ?? (() => []))(floorName),
          };
        }),
    ),
  );
}
function stagedDates(
  stages: CompanyConstructionStage[],
  floors: string[],
  start: string,
  skipSundays: boolean,
) {
  let cursor = new Date(start + 'T12:00:00');
  if (skipSundays && cursor.getDay() === 0)
    cursor.setDate(cursor.getDate() + 1);
  return stages.map((stage) => {
    const instances = stage.repeatsPerFloor ? floors : [''];
    const rows = instances.map((floorName) => {
      const first = new Date(cursor);
      const days = Math.max(
        stage.days,
        stage.items.reduce((sum, item) => sum + item.days, 0),
      );
      const end = addWorkingDays(first, Math.max(0, days - 1), skipSundays);
      let itemCursor = new Date(first);
      const items = stage.items.map((item) => {
        const itemStart = new Date(itemCursor);
        const itemEnd = addWorkingDays(
          itemStart,
          Math.max(0, item.days - 1),
          skipSundays,
        );
        if (item.days > 0) itemCursor = addWorkingDays(itemEnd, 1, skipSundays);
        return { ...item, start: itemStart, end: itemEnd };
      });
      cursor = addWorkingDays(end, 1, skipSundays);
      return { floorName, start: first, end, items };
    });
    return { stage, floors: rows };
  });
}

export function ConstructionProgramEditor({
  total,
  currency,
  editable,
  floorNames,
  companyDefaults,
  initial,
  boqPaymentAmounts = {},
}: Props) {
  const parsed = companyConstructionStages.safeParse(companyDefaults);
  const defaults = parsed.success
    ? parsed.data
    : defaultCompanyConstructionStages;
  const saved = savedQuotationConstructionProgram(initial.terms);
  // Company Settings is the source of truth for reusable stages and work.
  const stages = defaults;
  const [startDate, setStartDate] = useState(
    saved?.startDate ?? dateAt(new Date()),
  );
  const [skipSundays, setSkipSundays] = useState(saved?.skipSundays ?? true);
  const amount = Number(total) || 0;
  const storedPlan = savedStagePaymentPlan(initial.terms);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const fromBoq = Object.fromEntries(
      Object.entries(boqPaymentAmounts)
        .filter(([, value]) => Number.isFinite(value) && value >= 0)
        .map(([key, value]) => [key, String(value)]),
    );
    const fromSaved = Object.fromEntries(
      Object.entries(saved?.paymentOverrides ?? {}).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
    // Older quotations only saved one percentage per company stage.
    // Import their allocation for editing; it is not a new BOQ default.
    if (
      !saved?.paymentOverrides &&
      storedPlan?.length === stages.length &&
      amount > 0
    ) {
      stages.forEach((stage, index) => {
        const markers = stagePaymentItems(stage);
        const floorCount = stage.repeatsPerFloor ? floorNames.length : 1;
        const count = markers.length * floorCount;
        if (!count) return;
        const perItem =
          (amount * (storedPlan[index]?.percent ?? 0)) / 100 / count;
        for (let floor = 0; floor < floorCount; floor++) {
          markers.forEach((item) => {
            fromSaved[paymentItemKey(stage.id, floor, item.id)] = String(
              Number(perItem.toFixed(8)),
            );
          });
        }
      });
    }
    return { ...fromBoq, ...fromSaved };
  });
  const [feedback, setFeedback] = useState('');
  const [expandedStages, setExpandedStages] = useState<string[]>([
    'preconstruction',
    'slabs',
  ]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  const allocations = paymentAllocations(stages, floorNames, values);
  const datedStages = stagedDates(stages, floorNames, startDate, skipSundays);
  const plannedDays = datedStages.reduce(
    (sum, row) =>
      sum +
      row.floors.length *
        Math.max(
          row.stage.days,
          row.stage.items.reduce((n, item) => n + item.days, 0),
        ),
    0,
  );
  const targetHandover = datedStages.at(-1)?.floors.at(-1)?.end;
  const allocated = allocations.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const remaining = amount - allocated;
  const funded = allocations.filter((entry) => entry.amount > 0);
  const percentages = funded.map((entry) =>
    Number(((entry.amount / (amount || 1)) * 100).toFixed(8)),
  );
  if (percentages.length) {
    percentages[percentages.length - 1] = Number(
      (
        100 - percentages.slice(0, -1).reduce((sum, part) => sum + part, 0)
      ).toFixed(8),
    );
  }
  const valid =
    amount > 0 &&
    allocations.length > 0 &&
    funded.length > 0 &&
    funded.length === allocations.length &&
    funded.length <= 100 &&
    Math.abs(remaining) <= 0.01 &&
    Object.values(values).every(
      (value) =>
        value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0),
    ) &&
    percentages.every((part) => part > 0 && part <= 100);

  const save = () => {
    if (!editable || !valid) return;
    start(async () => {
      try {
        const response = await fetch(
          '/dashboard/quotations/' + initial.revision_id + '/conditions',
          {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'payments',
              program: {
                stages,
                floors: floorNames,
                startDate,
                skipSundays,
                paymentOverrides: Object.fromEntries(
                  allocations.map((row) => [
                    row.key,
                    Number(row.amount.toFixed(2)),
                  ]),
                ),
              },
              stages: funded.map((row, index) => ({
                name: row.name,
                percent: percentages[index]!.toFixed(8),
                stageCodes: row.stageCodes,
              })),
              // Leave saved QC/work overrides intact; the user edits them separately.
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
              'Unable to save this quotation payment schedule.',
          );
          return;
        }
        setFeedback(
          'Floor-specific payment amounts saved to the quotation. Finance will use these agreed amounts.',
        );
        router.refresh();
      } catch {
        setFeedback('Network error saving the payment schedule.');
      }
    });
  };

  if (!floorNames.length)
    return (
      <section className="qs-card qs-construction-program">
        <h2>Payments &amp; Work</h2>
        <p>
          Save the quotation floor schedule first. Payment items and target
          dates will then repeat per quoted floor.
        </p>
      </section>
    );

  return (
    <section className="qs-card qs-construction-program">
      <header className="qs-program-header">
        <div>
          <h2>Construction workflow · Payments &amp; Work</h2>
          <p>
            Seven stages follow the same reusable Company Settings workflow.
            Finish stages repeat floor by floor.
          </p>
        </div>
      </header>
      <div className="qs-program-synced-notice">
        <strong>
          Synced from Company Settings · Work sequence is read only
        </strong>
        <span>
          Work, checks, QC guides and stage durations are managed in Settings.
          Payment amounts can be set for this quotation.
        </span>
      </div>
      {feedback && (
        <p role="status" className="qs-program-feedback">
          {feedback}
        </p>
      )}
      <div className="qs-program-calendar">
        <div className="qs-program-start">
          <span>Project start date</span>
          {editable ? (
            <input
              id="construction-program-start"
              aria-label="Project start date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          ) : (
            <strong>{showDate(new Date(startDate + 'T12:00:00'))}</strong>
          )}
        </div>
        <div>
          <span>Calendar basis</span>
          <strong>
            {skipSundays ? 'Working days (Sundays excluded)' : 'Calendar days'}
          </strong>
        </div>
        {editable && (
          <label className="qs-program-skip-sundays">
            <input
              type="checkbox"
              checked={skipSundays}
              onChange={(event) => setSkipSundays(event.target.checked)}
            />
            Skip Sundays
          </label>
        )}
        <div>
          <span>Estimated handover</span>
          <strong>{targetHandover ? showDate(targetHandover) : '—'}</strong>
        </div>
        <div>
          <span>Total planned duration</span>
          <strong>
            {plannedDays} {skipSundays ? 'working days' : 'calendar days'}
          </strong>
        </div>
      </div>
      <div className="qs-program-list">
        {datedStages.map(({ stage, floors }, stageIndex) => {
          const stageAllocations = allocations.filter(
            (row) => row.stageId === stage.id,
          );
          const stageAmount = stageAllocations.reduce(
            (sum, row) => sum + row.amount,
            0,
          );
          const isExpanded = expandedStages.includes(stage.id);
          const stageDuration =
            floors.length *
            Math.max(
              stage.days,
              stage.items.reduce((days, item) => days + item.days, 0),
            );
          return (
            <article className="qs-program-stage" key={stage.id}>
              <button
                className="qs-program-stage-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedStages((current) =>
                    isExpanded
                      ? current.filter((id) => id !== stage.id)
                      : [...current, stage.id],
                  )
                }
              >
                <span className="qs-program-number">{stageIndex + 1}</span>
                <span className="qs-program-stage-title">
                  <strong>{stage.name}</strong>
                  <small>
                    {stage.repeatsPerFloor
                      ? 'Repeats: ' + floorNames.join(', ')
                      : 'One time'}
                  </small>
                </span>
                <span className="qs-program-stage-dates">
                  <small>Planned</small>
                  <strong>
                    {showDate(floors[0]!.start)} –{' '}
                    {showDate(floors[floors.length - 1]!.end)}
                  </strong>
                  <small>
                    {stageDuration} {skipSundays ? 'working days' : 'days'}
                  </small>
                </span>
                <span className="qs-program-stage-payment">
                  <small>Payment milestone</small>
                  <strong>{fmt(stageAmount)}</strong>
                </span>
                <span className="qs-program-stage-chevron">
                  {isExpanded ? '⌃' : '⌄'}
                </span>
              </button>
              {isExpanded && (
                <div className="qs-program-stage-content">
                  {floors.map((floor, floorIndex) => {
                    const floorPayments = stagePaymentItems(stage).map(
                      (item) => ({
                        item,
                        amount:
                          allocations.find(
                            (row) =>
                              row.stageId === stage.id &&
                              row.floorIndex === floorIndex &&
                              row.item.id === item.id,
                          )?.amount ?? 0,
                      }),
                    );
                    return (
                      <section
                        className="qs-program-floor"
                        key={stage.id + '-' + floorIndex}
                      >
                        <header className="qs-program-floor-heading">
                          <strong>
                            {floor.floorName || 'Whole project'}
                            {stage.repeatsPerFloor ? ' floor' : ''}
                          </strong>
                          <span>
                            {showDate(floor.start)} – {showDate(floor.end)}
                          </span>
                        </header>
                        <div className="qs-program-work-table">
                          <div className="qs-program-work-head">
                            <span>#</span>
                            <span>Work item</span>
                            <span>Planned dates</span>
                            <span>Days</span>
                            <span>Check / QC</span>
                            <span>Guide</span>
                          </div>
                          {floor.items
                            .filter((item) => item.kind !== 'payment')
                            .map((item, itemIndex) => (
                              <div
                                className="qs-program-work-row"
                                key={item.id}
                              >
                                <span className="qs-program-work-index">
                                  {itemIndex + 1}
                                </span>
                                <span className="qs-program-work-name">
                                  <strong>{item.title}</strong>
                                  <small>{item.kind}</small>
                                  {item.guideText && <p>{item.guideText}</p>}
                                </span>
                                <span>
                                  {showDate(item.start)} – {showDate(item.end)}
                                </span>
                                <span>{item.days} days</span>
                                <span>
                                  {item.kind === 'check' ||
                                  item.kind === 'test' ? (
                                    <b className="qs-program-check-chip">
                                      ✓ Check
                                    </b>
                                  ) : null}
                                  {item.kind === 'qc' ? (
                                    <b className="qs-program-qc-chip">QC</b>
                                  ) : null}
                                </span>
                                <span>
                                  {item.guideVideoUrl ? (
                                    <a
                                      href={item.guideVideoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Watch guide ↗
                                    </a>
                                  ) : item.guideText ? (
                                    'Guide included'
                                  ) : (
                                    '—'
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                        {floorPayments.map(({ item, amount }) => {
                          const key = paymentItemKey(
                            stage.id,
                            floorIndex,
                            item.id,
                          );
                          return (
                            <div className="qs-program-payment-entry" key={key}>
                              <span>Payment milestone · {item.title}</span>
                              {editable ? (
                                <label>
                                  <span>{currency}</span>
                                  <input
                                    aria-label={
                                      'Payment amount for ' +
                                      stage.name +
                                      ' ' +
                                      (floor.floorName || 'building') +
                                      ' ' +
                                      item.title
                                    }
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={values[key] ?? ''}
                                    onChange={(event) =>
                                      setValues((current) => ({
                                        ...current,
                                        [key]: event.target.value,
                                      }))
                                    }
                                    placeholder="Enter amount"
                                  />
                                </label>
                              ) : (
                                <strong>{fmt(amount)}</strong>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <footer className="qs-program-summary">
        <strong>
          Allocated {fmt(allocated)} of {fmt(amount)}
        </strong>
        <span>
          {Math.abs(remaining) <= 0.01
            ? 'Fully allocated'
            : 'Remaining to allocate: ' + fmt(remaining)}
        </span>
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={pending || !valid}
            data-studio-save="payments"
          >
            {pending ? 'Saving…' : 'Save payment schedule'}
          </button>
        )}
      </footer>
      {editable && !valid && (
        <p className="qs-note">
          Save is available once every payment marker has a positive amount and
          allocations total the quotation value exactly. Values are specific to
          this quote, not to Company Settings.
        </p>
      )}
      {!editable && !saved && (
        <p className="qs-note">
          This quotation has no saved construction payment programme.
        </p>
      )}
    </section>
  );
}
