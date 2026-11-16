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
) {
  let cursor = new Date(start + 'T12:00:00');
  if (cursor.getDay() === 0) cursor = addWorkingDays(cursor, 0);
  return stages.map((stage) => {
    const instances = stage.repeatsPerFloor ? floors : [''];
    const rows = instances.map((floorName) => {
      const first = new Date(cursor);
      const days = Math.max(
        stage.days,
        stage.items.reduce((sum, item) => sum + item.days, 0),
      );
      const end = addWorkingDays(first, Math.max(0, days - 1));
      let itemCursor = new Date(first);
      const items = stage.items.map((item) => {
        const itemStart = new Date(itemCursor);
        const itemEnd = addWorkingDays(itemStart, Math.max(0, item.days - 1));
        if (item.days > 0) itemCursor = addWorkingDays(itemEnd, 1);
        return { ...item, start: itemStart, end: itemEnd };
      });
      cursor = addWorkingDays(end, 1);
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
  // Keep a quotation revision's own work and payment markers stable even
  // if the company later edits its reusable template.
  const stages = saved?.stages ?? defaults;
  const startDate = saved?.startDate ?? dateAt(new Date());
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
  const [pending, start] = useTransition();
  const router = useRouter();
  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  const allocations = paymentAllocations(stages, floorNames, values);
  const datedStages = stagedDates(stages, floorNames, startDate);
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
          <h2>Payments &amp; Work</h2>
          <p>
            Work stages and QC come from Company Settings. Each payment item is
            priced separately for its floor in this quotation.
          </p>
        </div>
        <div className="qs-program-start">
          <span>Planned start</span>
          <strong>{showDate(new Date(startDate + 'T12:00:00'))}</strong>
        </div>
      </header>
      <p className="qs-note">
        {Object.keys(boqPaymentAmounts).length
          ? 'BOQ-linked payment defaults loaded. Edit any amount or percentage to override it for this quotation only.'
          : 'No stage-and-floor BOQ payment breakdown is linked to this quotation. Enter agreed payment amounts manually; no equal-per-floor split will be assumed.'}
      </p>
      {feedback && (
        <p role="status" className="qs-program-feedback">
          {feedback}
        </p>
      )}
      <div className="qs-program-list">
        <div className="qs-program-columns">
          <span>Stage &amp; floor</span>
          <span>Payment %</span>
          <span>Payment amount</span>
          <span>Target dates</span>
        </div>
        {datedStages.map(({ stage, floors }, stageIndex) => (
          <article className="qs-program-stage" key={stage.id}>
            <div className="qs-program-payment">
              <span className="qs-program-number">{stageIndex + 1}</span>
              <div className="qs-program-stage-title">
                <strong>{stage.name}</strong>
                <small>
                  {stage.repeatsPerFloor
                    ? 'Repeats for every quoted floor'
                    : 'One-time stage'}
                </small>
              </div>
              <strong>
                {fmt(
                  allocations
                    .filter((row) => row.stageId === stage.id)
                    .reduce((sum, row) => sum + row.amount, 0),
                )}
              </strong>
              <span>
                {showDate(floors[0]!.start)} –{' '}
                {showDate(floors[floors.length - 1]!.end)}
              </span>
            </div>
            <div className="qs-program-work">
              {floors.map((floor, floorIndex) => (
                <section
                  className="qs-program-floor"
                  key={stage.id + '-' + floorIndex}
                >
                  <h3>
                    {floor.floorName || stage.name} · {showDate(floor.start)} –{' '}
                    {showDate(floor.end)}
                  </h3>
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
                        <span>{item.days} planned days</span>
                      </li>
                    ))}
                  </ol>
                  {stagePaymentItems(stage).map((item) => {
                    const key = paymentItemKey(stage.id, floorIndex, item.id);
                    const payment = Number(values[key] || 0);
                    return (
                      <div className="qs-program-payment-entry" key={key}>
                        <strong>Payment · {item.title}</strong>
                        <label>
                          Amount ({currency})
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
                            disabled={!editable}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                            placeholder="Enter amount"
                          />
                        </label>
                        <label>
                          Share of quotation (%)
                          <input
                            aria-label={
                              'Payment percentage for ' +
                              stage.name +
                              ' ' +
                              (floor.floorName || 'building') +
                              ' ' +
                              item.title
                            }
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            inputMode="decimal"
                            value={
                              values[key] === undefined ||
                              values[key] === '' ||
                              amount <= 0
                                ? ''
                                : Number(((payment / amount) * 100).toFixed(4))
                            }
                            disabled={!editable || amount <= 0}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [key]:
                                  event.target.value === ''
                                    ? ''
                                    : String(
                                        Number(
                                          (
                                            (Number(event.target.value) / 100) *
                                            amount
                                          ).toFixed(8),
                                        ),
                                      ),
                              }))
                            }
                            placeholder="0"
                          />
                        </label>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </article>
        ))}
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
          <button type="button" onClick={save} disabled={pending || !valid}>
            {pending ? 'Saving…' : 'Save quotation payments'}
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
