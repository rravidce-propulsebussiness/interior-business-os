'use client';
import { useState, useTransition } from 'react';
import { Button } from '@business-os/ui';
import { resolveAnswers } from '@business-os/quotation-engine';
import type {
  Catalog,
  Answers,
  Calculation,
} from '@business-os/quotation-engine';
import { previewPrice } from './actions';
import { QuestionFields } from './question-fields';
export function PricePreview({
  catalog,
  itemId,
  org,
}: {
  catalog: Catalog;
  itemId: string;
  org: string;
}) {
  const item = catalog.items.find((i) => i.id === itemId)!;
  const attributes = catalog.attributes.filter((a) => a.item_id === itemId),
    options = catalog.options.filter((o) => o.item_id === itemId);
  const [answers, setAnswers] = useState<Answers>({}),
    [result, setResult] = useState<Calculation>(),
    [message, setMessage] = useState(''),
    [pending, startTransition] = useTransition();
  let resolved: { answers: Answers; visible: string[] };
  try {
    resolved = resolveAnswers(attributes, options, answers, false);
  } catch {
    resolved = { answers: {}, visible: [] };
  }
  const method = catalog.methods.find((m) => m.key === item.method_key);
  return (
    <section className="my-8 rounded-xl border bg-card p-5">
      <h2 className="text-2xl font-semibold">Price preview</h2>
      <p className="my-2">Test saved configuration. No quotation is created.</p>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget),
            measurements: Record<string, string> = {};
          for (const field of method?.fields ?? [])
            measurements[field] = String(form.get('measure_' + field));
          setResult(undefined);
          startTransition(async () => {
            const response = await previewPrice({
              organization_id: org,
              item_id: itemId,
              price_book_id: form.get('book') || null,
              branch_id: form.get('branch') || null,
              currency: form.get('currency'),
              at: form.get('at'),
              measurements,
              answers,
            });
            setMessage(response.message);
            setResult(response.result);
          });
        }}
      >
        <label className="grid gap-1">
          Currency
          <input
            name="currency"
            required
            pattern="[A-Z]{3}"
            defaultValue={
              catalog.rates.find((r) => r.item_id === itemId)?.currency ?? ''
            }
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1">
          Calculation date (ISO timestamp)
          <input
            name="at"
            required
            defaultValue={new Date().toISOString()}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1">
          Price book
          <select name="book" className="rounded border p-2">
            <option value="">Resolve automatically</option>
            {catalog.books
              .filter((b) => b.status === 'active')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency})
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1">
          Branch
          <select name="branch" className="rounded border p-2">
            <option value="">Organization</option>
            {catalog.branches
              .filter((b) => b.status === 'active')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        {(method?.fields ?? []).map((field) => (
          <label key={field} className="grid gap-1">
            {field}
            <input
              required
              name={'measure_' + field}
              inputMode="decimal"
              className="rounded border p-2"
            />
          </label>
        ))}
        <p className="sm:col-span-2">
          Unit: {catalog.units.find((u) => u.key === item.unit_key)?.label}
        </p>
        <QuestionFields
          attributes={attributes}
          options={options}
          answers={answers}
          setAnswers={setAnswers}
          resolved={resolved}
        />
        <div className="sm:col-span-2">
          <Button disabled={pending}>
            {pending ? 'Calculating…' : 'Calculate price'}
          </Button>
          <p role="status" className="mt-3">
            {message}
          </p>
        </div>
      </form>
      {result && (
        <div className="mt-6" aria-live="polite">
          <dl className="grid grid-cols-2 gap-3">
            <dt>Quantity</dt>
            <dd>{result.calculatedQuantity}</dd>
            <dt>Base rate</dt>
            <dd>
              {result.baseRate} {result.currency}
            </dd>
            <dt>Adjusted unit rate</dt>
            <dd>{result.adjustedUnitRate}</dd>
            <dt>Finished-work subtotal</dt>
            <dd>{result.finishedWorkSubtotal}</dd>
            <dt>Final calculated amount</dt>
            <dd className="font-semibold">
              {result.finalCalculatedAmount} {result.currency}
            </dd>
            <dt>Minimum selling rate</dt>
            <dd>{result.minimumSellingRate ?? 'Not configured'}</dd>
            {result.internal && (
              <>
                <dt>Estimated internal cost</dt>
                <dd>{result.internal.estimatedCost}</dd>
                <dt>Estimated gross contribution</dt>
                <dd>{result.internal.grossContribution}</dd>
              </>
            )}
          </dl>
          {result.belowMinimum && (
            <p role="alert">
              Below configured minimum. A future quotation workflow must review
              an override.
            </p>
          )}
          <h3 className="mt-4 font-semibold">Modifiers</h3>
          <ul>
            {[
              ...result.rateModifiers,
              ...result.fixedModifiers,
              ...result.percentageModifiers,
            ].map((m) => (
              <li key={m.id}>
                {m.label}: {m.value}
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary>Calculation snapshot and full breakdown</summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
          <Button
            className="mt-4"
            onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], {
                  type: 'application/json',
                }),
                url = URL.createObjectURL(blob),
                a = document.createElement('a');
              a.href = url;
              a.download = 'price-preview.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download calculation snapshot
          </Button>
        </div>
      )}
    </section>
  );
}
