'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@business-os/ui';
import { financeCommand } from './actions';
export interface FinanceField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'textarea' | 'checkbox';
  required?: boolean;
  nullable?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
}
type Values = Record<string, unknown>;
function Field({
  field,
  name,
  value,
}: {
  field: FinanceField;
  name: string;
  value: unknown;
}) {
  const className = 'rounded border bg-background p-2';
  return (
    <label className="grid gap-1">
      {field.label}
      {field.options ? (
        <select
          name={name}
          defaultValue={String(value ?? '')}
          required={field.required}
          className={className}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          name={name}
          defaultValue={String(value ?? '')}
          rows={3}
          required={field.required}
          className={className}
        />
      ) : field.type === 'checkbox' ? (
        <input name={name} type="checkbox" defaultChecked={value === true} />
      ) : (
        <input
          name={name}
          type={field.type ?? 'text'}
          defaultValue={String(value ?? '')}
          required={field.required}
          className={className}
        />
      )}{' '}
      {field.hint && (
        <span className="text-sm text-muted-foreground">{field.hint}</span>
      )}
    </label>
  );
}
export function FinanceForm({
  initial,
  title,
  fields = [],
  itemFields,
  itemsKey = 'items',
  itemDefaults = {},
  maxItems = 100,
}: {
  initial: Values;
  title: string;
  fields?: FinanceField[];
  itemFields?: FinanceField[];
  itemsKey?: string;
  itemDefaults?: Values;
  maxItems?: number;
}) {
  const input =
    initial.input && typeof initial.input === 'object'
      ? (initial.input as Values)
      : initial;
  const initialRows = Array.isArray(input[itemsKey])
    ? (input[itemsKey] as Values[])
    : [itemDefaults];
  const [rows, setRows] = useState(() =>
      initialRows.map((value, index) => ({ key: index, value })),
    ),
    [nextKey, setNextKey] = useState(initialRows.length),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition(),
    router = useRouter();
  const read = (form: FormData, field: FinanceField, name: string) =>
    field.type === 'checkbox'
      ? form.has(name)
      : field.nullable && form.get(name) === ''
        ? null
        : String(form.get(name) ?? '');
  return (
    <form
      className="my-5 grid max-w-4xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values: Values = {
          ...input,
          ...Object.fromEntries(
            fields.map((f) => [f.key, read(form, f, f.key)]),
          ),
        };
        if (itemFields)
          values[itemsKey] = rows.map((row) => {
            const value: Values = {
              ...row.value,
              ...Object.fromEntries(
                itemFields.map((f) => [
                  f.key,
                  read(form, f, `${row.key}.${f.key}`),
                ]),
              ),
            };
            if (typeof value.source_ref === 'string') {
              const [source_type, source_id] = value.source_ref.split(':');
              delete value.source_ref;
              value.source_type = source_type;
              value.source_id = source_id || null;
            }
            return value;
          });
        const command = initial.input ? { ...initial, input: values } : values;
        start(async () => {
          try {
            const result = await financeCommand(command);
            setMessage(result.message);
            if (result.id && result.entity) {
              router.push(`/dashboard/finance/${result.entity}/${result.id}`);
              router.refresh();
            }
          } catch {
            setMessage('Unable to save commercial record.');
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} field={f} name={f.key} value={input[f.key]} />
        ))}
      </div>
      {itemFields &&
        rows.map((row, index) => (
          <fieldset className="rounded border p-4" key={row.key}>
            <legend className="px-2">
              {itemsKey === 'allocations' ? 'Allocation' : 'Line'} {index + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {itemFields.map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  name={`${row.key}.${f.key}`}
                  value={row.value[f.key]}
                />
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              {index > 0 && (
                <Button
                  type="button"
                  onClick={() =>
                    setRows((current) => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [
                        next[index]!,
                        next[index - 1]!,
                      ];
                      return next;
                    })
                  }
                >
                  Move up
                </Button>
              )}
              <Button
                type="button"
                onClick={() =>
                  setRows((current) => current.filter((r) => r.key !== row.key))
                }
              >
                Remove
              </Button>
            </div>
          </fieldset>
        ))}
      {itemFields && rows.length < maxItems && (
        <Button
          type="button"
          onClick={() => {
            setRows((current) => [
              ...current,
              {
                key: nextKey,
                value: {
                  ...itemDefaults,
                  ...(itemsKey === 'allocations'
                    ? { idempotency_key: crypto.randomUUID() }
                    : {}),
                },
              },
            ]);
            setNextKey(nextKey + 1);
          }}
        >
          Add {itemsKey === 'allocations' ? 'allocation' : 'line'}
        </Button>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : title}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
