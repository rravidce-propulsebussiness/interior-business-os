'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  operationDefinitions,
  type OperationField,
} from '@business-os/core/operations-command';
import { operationCommand, operationChoices } from './actions';
type Value = Record<string, unknown>;
function Reference({
  field,
  value,
  onChange,
  project,
}: {
  field: OperationField;
  value: unknown;
  onChange: (value: unknown) => void;
  project?: string | undefined;
}) {
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      operationChoices(field.reference!, project, query, page)
        .then((r) => {
          if (active) {
            setRows(r.rows);
            setMore(r.has_more);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('Choices unavailable.');
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [field.reference, project, query, page]);
  return (
    <div>
      <input
        aria-label={`Search ${field.label}`}
        placeholder="Search choices"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        className="mb-1 w-full rounded border p-2 text-sm"
      />
      <select
        aria-label={field.label}
        required={field.required}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border p-2"
      >
        <option value="">Select…</option>
        {typeof value === 'string' &&
          value &&
          !rows.some((r) => r.id === value) && (
            <option value={value}>Selected record</option>
          )}
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <div className="flex gap-3 text-xs">
        {page > 1 && (
          <button type="button" onClick={() => setPage(page - 1)}>
            Previous choices
          </button>
        )}
        {more && (
          <button type="button" onClick={() => setPage(page + 1)}>
            More choices
          </button>
        )}
        {error && <span role="status">{error}</span>}
      </div>
    </div>
  );
}
function Fields({
  fields,
  value,
  onChange,
  project,
}: {
  fields: OperationField[];
  value: Value;
  onChange: (value: Value) => void;
  project?: string | undefined;
}) {
  return (
    <>
      {fields.map((field) => {
        const current = value[field.key],
          change = (v: unknown) => onChange({ ...value, [field.key]: v });
        if ((field.key === 'id' && !field.reference) || field.key === 'version')
          return null;
        if (field.children) {
          const rows = Array.isArray(current) ? (current as Value[]) : [{}];
          return (
            <fieldset
              className="col-span-full space-y-3 rounded border p-3"
              key={field.key}
            >
              <legend className="px-1 text-sm font-medium">
                {field.label}
              </legend>
              {rows.map((row, index) => (
                <div
                  className="grid gap-3 border-b pb-3 sm:grid-cols-2"
                  key={index}
                >
                  <Fields
                    fields={field.children!}
                    value={row}
                    project={project}
                    onChange={(next) =>
                      change(rows.map((r, i) => (i === index ? next : r)))
                    }
                  />
                  <button
                    type="button"
                    className="text-left text-xs underline"
                    onClick={() => change(rows.filter((_, i) => i !== index))}
                  >
                    Remove line
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm underline"
                disabled={rows.length >= 100}
                onClick={() => change([...rows, {}])}
              >
                Add line
              </button>
            </fieldset>
          );
        }
        return (
          <div
            key={field.key}
            className={field.type === 'textarea' ? 'col-span-full' : ''}
          >
            <label
              className="mb-1 block text-sm"
              htmlFor={field.reference ? undefined : field.key}
            >
              {field.label}
              {field.required ? ' *' : ''}
            </label>
            {field.reference ? (
              <Reference
                field={field}
                value={current}
                onChange={change}
                project={project}
              />
            ) : field.type === 'boolean' ? (
              <input
                aria-label={field.label}
                type="checkbox"
                checked={current === true}
                onChange={(e) => change(e.target.checked)}
              />
            ) : field.options ? (
              <select
                id={field.key}
                className="w-full rounded border p-2"
                required={field.required}
                value={String(current ?? '')}
                onChange={(e) => change(e.target.value)}
              >
                <option value="">Select…</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={field.key}
                className="w-full rounded border p-2"
                required={field.required}
                value={String(current ?? '')}
                onChange={(e) => change(e.target.value)}
              />
            ) : (
              <input
                id={field.key}
                className="w-full rounded border p-2"
                required={field.required}
                type={
                  field.type === 'date'
                    ? 'date'
                    : field.type === 'integer'
                      ? 'number'
                      : 'text'
                }
                inputMode={field.type === 'decimal' ? 'decimal' : undefined}
                value={String(current ?? '')}
                onChange={(e) => change(e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
function payload(fields: OperationField[], value: Value): Value {
  const result: Value = {};
  for (const field of fields) {
    const v = value[field.key];
    if (field.type === 'boolean') result[field.key] = v === true;
    else if (field.children)
      result[field.key] = (Array.isArray(v) ? v : []).map((row) =>
        payload(field.children!, row as Value),
      );
    else if (v !== '' && v !== undefined && v !== null)
      result[field.key] = field.type === 'integer' ? Number(v) : v;
  }
  return result;
}
export function OperationForm({
  action,
  initial = {},
  project,
}: {
  action: string;
  initial?: Value;
  project?: string | undefined;
}) {
  const definition = operationDefinitions[action]!,
    router = useRouter();
  const [value, setValue] = useState<Value>(() => ({
      ...Object.fromEntries(
        definition.fields
          .filter((f) => f.type === 'boolean')
          .map((f) => [f.key, f.key === 'active']),
      ),
      ...initial,
    })),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(''),
    [retryKey, setRetryKey] = useState<string | null>(null);
  return (
    <form
      className="grid max-w-3xl gap-4 rounded border p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const input = payload(definition.fields, value);
          if (definition.group === 'save' && initial.id) {
            input.id = initial.id;
            input.version = initial.version;
          }
          if (definition.group === 'stock') {
            const key = retryKey ?? crypto.randomUUID();
            setRetryKey(key);
            input.idempotency_key = key;
          }
          const result = await operationCommand({ action, input });
          setMessage(result.message);
          if (result.id) {
            setRetryKey(null);
            router.push(`/dashboard/operations/${result.entity}/${result.id}`);
            router.refresh();
          }
        });
      }}
    >
      <Fields
        fields={definition.fields}
        value={value}
        onChange={setValue}
        project={
          typeof value.project_id === 'string' ? value.project_id : project
        }
      />
      <div className="col-span-full flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {pending ? 'Saving…' : definition.label}
        </button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
