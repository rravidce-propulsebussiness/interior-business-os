'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@business-os/ui';
import { executionCommand } from './actions';
export interface ExecutionField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'textarea' | 'checkbox' | 'integer';
  required?: boolean;
  optional?: boolean;
  multiple?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
}
type Values = Record<string, unknown>;
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, compact(item)])
        .filter(
          ([, item]) =>
            item !== undefined &&
            !(
              item &&
              typeof item === 'object' &&
              !Array.isArray(item) &&
              Object.keys(item).length === 0
            ),
        ),
    );
  return value;
}
function valueAt(value: Values, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split('.'))
    current =
      current && typeof current === 'object'
        ? (current as Values)[key]
        : undefined;
  return current;
}
function setAt(value: Values, path: string, next: unknown) {
  const keys = path.split('.');
  let current = value;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Invalid field');
    if (!current[key] || typeof current[key] !== 'object')
      current[key] = /^\d+$/.test(keys[i + 1]!) ? [] : {};
    current = current[key] as Values;
  }
  current[keys.at(-1)!] = next;
}
function Field({
  field,
  name,
  value,
}: {
  field: ExecutionField;
  name: string;
  value: unknown;
}) {
  const style = 'rounded border bg-background p-2';
  return (
    <label className="grid gap-1">
      {field.label}
      {field.options ? (
        <select
          className={style}
          name={name}
          multiple={field.multiple}
          required={field.required}
          defaultValue={
            field.multiple
              ? Array.isArray(value)
                ? value.map(String)
                : []
              : String(value ?? '')
          }
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          className={style}
          name={name}
          rows={3}
          required={field.required}
          defaultValue={String(value ?? '')}
        />
      ) : field.type === 'checkbox' ? (
        <input type="checkbox" name={name} defaultChecked={value === true} />
      ) : (
        <input
          className={style}
          name={name}
          type={field.type === 'integer' ? 'number' : (field.type ?? 'text')}
          required={field.required}
          defaultValue={String(value ?? '')}
          step={field.type === 'integer' ? 1 : undefined}
        />
      )}{' '}
      {field.hint && (
        <span className="text-sm text-muted-foreground">{field.hint}</span>
      )}
    </label>
  );
}
export function ExecutionForm({
  initial,
  title,
  fields = [],
  itemFields,
  itemsKey = 'items',
  itemDefaults = {},
  maxItems = 100,
  returnTo,
}: {
  initial: Values;
  title: string;
  fields?: ExecutionField[];
  itemFields?: ExecutionField[];
  itemsKey?: string;
  itemDefaults?: Values;
  maxItems?: number;
  returnTo?: string;
}) {
  const input = (
    initial.input && typeof initial.input === 'object' ? initial.input : initial
  ) as Values;
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
  const read = (data: FormData, f: ExecutionField, name: string) =>
    f.multiple
      ? data.getAll(name).map(String)
      : f.type === 'checkbox'
        ? data.has(name)
        : f.optional && data.get(name) === ''
          ? undefined
          : f.type === 'integer'
            ? Number(data.get(name))
            : String(data.get(name) ?? '');
  return (
    <form
      className="my-5 grid max-w-5xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const values = structuredClone(input);
        for (const f of fields) setAt(values, f.key, read(data, f, f.key));
        if (itemFields)
          values[itemsKey] = rows.map((row) => {
            const value = structuredClone(row.value);
            for (const f of itemFields)
              setAt(value, f.key, read(data, f, `${row.key}.${f.key}`));
            return value;
          });
        // JSON transport omits optional blank fields; numeric quantities remain strings.
        const command = JSON.parse(
          JSON.stringify(
            compact(initial.input ? { ...initial, input: values } : values),
          ),
        ) as unknown;
        start(async () => {
          try {
            const result = await executionCommand(command);
            setMessage(result.message);
            if (result.id && result.entity) {
              router.push(
                returnTo ??
                  `/dashboard/execution/${result.entity}/${result.id}`,
              );
              router.refresh();
            }
          } catch {
            setMessage('Unable to save execution record.');
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field
            key={f.key}
            field={f}
            name={f.key}
            value={valueAt(input, f.key)}
          />
        ))}
      </div>
      {itemFields &&
        rows.map((row, index) => (
          <fieldset key={row.key} className="rounded border p-4">
            <legend className="px-2">Line {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {itemFields.map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  name={`${row.key}.${f.key}`}
                  value={valueAt(row.value, f.key)}
                />
              ))}
            </div>
            <Button
              type="button"
              className="mt-3"
              onClick={() =>
                setRows((current) => current.filter((r) => r.key !== row.key))
              }
            >
              Remove line
            </Button>
          </fieldset>
        ))}
      {itemFields && (
        <Button
          type="button"
          disabled={rows.length >= maxItems}
          onClick={() => {
            setRows((current) => [
              ...current,
              { key: nextKey, value: structuredClone(itemDefaults) },
            ]);
            setNextKey(nextKey + 1);
          }}
        >
          Add line
        </Button>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : title}
      </Button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
