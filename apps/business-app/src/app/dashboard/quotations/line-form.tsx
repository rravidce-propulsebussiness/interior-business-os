'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@business-os/ui';
import {
  catalogLine,
  catalogLineInputSchema,
  resolveAnswers,
} from '@business-os/quotation-engine';
import type {
  Catalog,
  Answers,
  LineSnapshot,
} from '@business-os/quotation-engine';
import { QuestionFields } from '../catalog/question-fields';
import { saveQuotationLine } from './actions';
export function LineForm({
  org,
  revisionId,
  version,
  currency,
  branch,
  areas,
  catalog,
  existing,
  canDiscount,
  canOverride,
}: {
  org: string;
  revisionId: string;
  version: number;
  currency: string;
  branch: string | null;
  areas: { id: string; name: string }[];
  catalog?: Catalog;
  existing?: {
    id: string;
    snapshot: LineSnapshot;
    project_area_id: string | null;
    optional: boolean;
    sort_order: number;
    description: string;
  };
  canDiscount: boolean;
  canOverride: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>(
      existing?.snapshot.pricing_input?.answers ?? {},
    ),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition(),
    router = useRouter();
  const item = catalog?.items[0],
    method = catalog?.methods.find((m) => m.key === item?.method_key);
  let resolved: { answers: Answers; visible: string[] } = {
    answers: {},
    visible: [],
  };
  try {
    if (catalog)
      resolved = resolveAnswers(
        catalog.attributes,
        catalog.options,
        answers,
        false,
      );
  } catch {
    /* Save fails closed through canonical validation. */
  }
  function input(form: HTMLFormElement) {
    const f = new FormData(form),
      get = (k: string) => String(f.get(k) ?? ''),
      base = {
        ...(existing ? { id: existing.id } : {}),
        area_id: get('area') || null,
        sort_order: Number(get('sort_order')),
        optional: f.has('optional'),
        description: get('description'),
        discount: {
          kind: get('discount_kind') || 'none',
          value: get('discount_value') || '0',
        },
      };
    return item
      ? {
          ...base,
          override: get('override_rate')
            ? { rate: get('override_rate'), reason: get('reason') }
            : null,
          pricing: {
            organization_id: org,
            item_id: item.id,
            price_book_id: get('book') || null,
            branch_id: branch,
            currency,
            at: new Date().toISOString(),
            measurements: Object.fromEntries(
              (method?.fields ?? []).map((k) => [k, get(`measure_${k}`)]),
            ),
            answers: resolved.answers,
          },
        }
      : {
          ...base,
          name: get('name'),
          quantity: get('quantity'),
          unit: get('unit'),
          rate: get('rate'),
          reason: get('reason'),
          estimated_cost_rate: null,
        };
  }
  return (
    <form
      className="my-5 grid max-w-3xl gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = input(event.currentTarget);
        start(async () => {
          try {
            const r = await saveQuotationLine(
              revisionId,
              version,
              item ? 'catalog' : 'manual',
              value,
            );
            setMessage(r.message);
            if (r.id) router.refresh();
          } catch {
            setMessage('Unable to save line.');
          }
        });
      }}
    >
      <label className="grid gap-1">
        Area
        <select
          name="area"
          defaultValue={existing?.project_area_id ?? ''}
          className="rounded border p-2"
        >
          <option value="">Ungrouped</option>
          {areas.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Order
        <input
          name="sort_order"
          type="number"
          min={0}
          max={10000}
          defaultValue={existing?.sort_order ?? 0}
          className="rounded border p-2"
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="optional"
          defaultChecked={existing?.optional}
        />{' '}
        Optional item (excluded from payable total)
      </label>
      <label className="grid gap-1">
        Description
        <textarea
          name="description"
          maxLength={3000}
          defaultValue={existing?.description ?? ''}
          className="rounded border p-2"
        />
      </label>
      {item && catalog ? (
        <>
          <p className="sm:col-span-2">
            {item.name} · {currency} ·{' '}
            {catalog.units.find((u) => u.key === item.unit_key)?.label}
          </p>
          <label className="grid gap-1">
            Price book
            <select
              name="book"
              defaultValue={
                existing?.snapshot.pricing_input?.price_book_id ?? ''
              }
              className="rounded border p-2"
            >
              <option value="">Resolve automatically</option>
              {catalog.books
                .filter((b) => b.status === 'active' && b.currency === currency)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          {method?.fields.map((k) => (
            <label className="grid gap-1" key={k}>
              {k}
              <input
                name={`measure_${k}`}
                defaultValue={
                  existing?.snapshot.pricing_input?.measurements[k] ?? ''
                }
                inputMode="decimal"
                required
                className="rounded border p-2"
              />
            </label>
          ))}
          <QuestionFields
            attributes={catalog.attributes}
            options={catalog.options}
            answers={answers}
            setAnswers={setAnswers}
            resolved={resolved}
          />
        </>
      ) : (
        ['name', 'quantity', 'unit', 'rate'].map((k) => (
          <label key={k} className="grid gap-1">
            {k}
            <input
              name={k}
              required
              className="rounded border p-2"
              defaultValue={
                k === 'name'
                  ? existing?.snapshot.name
                  : k === 'quantity'
                    ? existing?.snapshot.quantity
                    : k === 'unit'
                      ? existing?.snapshot.unit.label
                      : existing?.snapshot.display_rate
              }
            />
          </label>
        ))
      )}
      {canDiscount ? (
        <>
          <label className="grid gap-1">
            Line discount
            <select
              name="discount_kind"
              defaultValue={existing?.snapshot.discount.kind ?? 'none'}
              className="rounded border p-2"
            >
              <option value="none">None</option>
              <option value="fixed">Fixed amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </label>
          <label className="grid gap-1">
            Discount value
            <input
              name="discount_value"
              inputMode="decimal"
              defaultValue={existing?.snapshot.discount.value ?? '0'}
              className="rounded border p-2"
            />
          </label>
        </>
      ) : (
        <>
          <input
            type="hidden"
            name="discount_kind"
            value={existing?.snapshot.discount.kind ?? 'none'}
          />
          <input
            type="hidden"
            name="discount_value"
            value={existing?.snapshot.discount.value ?? '0'}
          />
        </>
      )}
      {canOverride && item && (
        <label className="grid gap-1">
          Override selling rate (optional)
          <input
            name="override_rate"
            inputMode="decimal"
            defaultValue={existing?.snapshot.override?.rate ?? ''}
            className="rounded border p-2"
          />
        </label>
      )}
      {(canOverride || !item) && (
        <label className="grid gap-1">
          Override/manual reason
          <input
            name="reason"
            minLength={3}
            maxLength={500}
            required={!item}
            defaultValue={
              existing?.snapshot.override?.reason ??
              existing?.snapshot.manual_reason ??
              ''
            }
            className="rounded border p-2"
          />
        </label>
      )}
      {item && catalog && (
        <Button
          type="button"
          onClick={(event) => {
            try {
              const form = event.currentTarget.form!;
              const value = catalogLineInputSchema.parse(input(form)),
                result = catalogLine(catalog, value);
              setMessage(
                `${existing ? `Saved amount ${existing.snapshot.final_amount}. ` : ''}Current preview ${result.snapshot.final_amount} ${currency}. Save recalculates on the server.`,
              );
            } catch {
              setMessage(
                'Complete required questions and valid dimensions. Discounts and overrides must respect minimum rates.',
              );
            }
          }}
        >
          Preview current price
        </Button>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? 'Saving…'
          : existing
            ? 'Recalculate and save line'
            : 'Save line'}
      </Button>
      <p className="sm:col-span-2" role="status">
        {message}
      </p>
    </form>
  );
}
