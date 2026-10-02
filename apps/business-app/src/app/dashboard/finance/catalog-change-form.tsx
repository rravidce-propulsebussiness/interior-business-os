'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  catalogLine,
  catalogLineInputSchema,
  resolveAnswers,
} from '@business-os/quotation-engine';
import type { Catalog, Answers } from '@business-os/quotation-engine';
import { QuestionFields } from '../catalog/question-fields';
import { Button } from '@business-os/ui';
import { financeCommand } from './actions';
export function CatalogChangeForm({
  org,
  contractId,
  currency,
  branch,
  catalog,
  scope,
}: {
  org: string;
  contractId: string;
  currency: string;
  branch: string | null;
  catalog: Catalog;
  scope: { id: string; name: string; amount: string }[];
}) {
  const [answers, setAnswers] = useState<Answers>({}),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState(''),
    [pending, start] = useTransition(),
    router = useRouter();
  const item = catalog.items[0]!,
    method = catalog.methods.find((m) => m.key === item.method_key);
  let resolved: { answers: Answers; visible: string[] } = {
    answers: {},
    visible: [],
  };
  try {
    resolved = resolveAnswers(
      catalog.attributes,
      catalog.options,
      answers,
      false,
    );
  } catch {
    /* Canonical save validation reports invalid selections. */
  }
  function input(form: HTMLFormElement) {
    const f = new FormData(form),
      get = (key: string) => String(f.get(key) ?? '');
    return {
      form: f,
      line: catalogLineInputSchema.parse({
        area_id: null,
        sort_order: 0,
        optional: false,
        description: get('description'),
        discount: { kind: 'none', value: '0' },
        override: null,
        pricing: {
          organization_id: org,
          item_id: item.id,
          price_book_id: get('book') || null,
          branch_id: branch,
          currency,
          at: new Date().toISOString(),
          measurements: Object.fromEntries(
            (method?.fields ?? []).map((key) => [key, get(key)]),
          ),
          answers: resolved.answers,
        },
      }),
    };
  }
  return (
    <form
      className="my-6 grid max-w-3xl gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        let value: ReturnType<typeof input>;
        try {
          value = input(event.currentTarget);
        } catch {
          setMessage('Complete the required dimensions and specifications.');
          return;
        }
        const f = value.form;
        start(async () => {
          const response = await financeCommand({
            action: 'change_order',
            input: {
              action: 'save',
              contract_id: contractId,
              reason: String(f.get('reason') ?? ''),
              terms: '',
              items: [
                {
                  change_type: String(f.get('change_type')),
                  description: String(f.get('description') ?? item.name),
                  reason: String(f.get('reason') ?? ''),
                  area: String(f.get('area') ?? ''),
                  original_item_id:
                    String(f.get('original_item_id') ?? '') || null,
                  pricing_type: 'catalog',
                  pricing: value.line,
                },
              ],
            },
          });
          setMessage(response.message);
          if (response.id)
            router.push(`/dashboard/finance/change_orders/${response.id}`);
        });
      }}
    >
      <label className="grid gap-1">
        Change type
        <select className="rounded border p-2" name="change_type">
          <option value="addition">Addition</option>
          <option value="modification">
            Modification (new minus original)
          </option>
        </select>
      </label>
      <label className="grid gap-1">
        Original scope (modification only)
        <select className="rounded border p-2" name="original_item_id">
          <option value="">New addition</option>
          {scope.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} / {s.amount}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Description
        <input
          className="rounded border p-2"
          name="description"
          defaultValue={item.name}
          required
        />
      </label>
      <label className="grid gap-1">
        Room / area
        <input className="rounded border p-2" name="area" />
      </label>
      <label className="grid gap-1 sm:col-span-2">
        Reason
        <textarea
          className="rounded border p-2"
          name="reason"
          minLength={3}
          required
        />
      </label>
      <label className="grid gap-1">
        Price book
        <select className="rounded border p-2" name="book">
          <option value="">Resolve default</option>
          {catalog.books
            .filter((b) => b.status === 'active' && b.currency === currency)
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </label>
      {(method?.fields ?? []).map((key) => (
        <label className="grid gap-1" key={key}>
          {key}
          <input
            className="rounded border p-2"
            name={key}
            inputMode="decimal"
            required
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
      <Button
        type="button"
        onClick={(event) => {
          try {
            const form = event.currentTarget.form;
            if (form) {
              const result = catalogLine(catalog, input(form).line);
              setPreview(
                `${currency} ${result.snapshot.final_amount} new scope. The saved variation deducts the original contracted value for modifications.`,
              );
            }
          } catch {
            setPreview('Complete the required dimensions and specifications.');
          }
        }}
      >
        Preview canonical price
      </Button>
      <Button disabled={pending}>
        {pending ? 'Saving…' : 'Save priced change order'}
      </Button>
      <p className="sm:col-span-2" role="status">
        {message || preview}
      </p>
    </form>
  );
}
