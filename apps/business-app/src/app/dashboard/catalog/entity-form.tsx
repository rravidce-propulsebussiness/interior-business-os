'use client';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from '@business-os/ui';
import type { Entity } from '@business-os/quotation-engine';
import { saveCatalog } from './actions';
export interface Field {
  key: string;
  label: string;
  type?:
    'checkbox' | 'number' | 'text' | 'datetime-local' | 'multi' | 'textarea';
  choices?: { value: string; label: string; parentKey?: string }[];
  nullable?: boolean;
  required?: boolean;
}
export function EntityForm({
  entity,
  org,
  initial,
  fields,
  title,
  replace,
}: {
  entity: Entity;
  org: string;
  initial: Record<string, unknown>;
  fields: Field[];
  title: string;
  replace?: { id: string; version: number };
}) {
  const { register, handleSubmit } = useForm<Record<string, unknown>>({
    defaultValues: initial,
  });
  const [message, setMessage] = useState(''),
    [pending, startTransition] = useTransition();
  const router = useRouter();
  const [conditions, setConditions] = useState<
    { attribute_key: string; operator: string; values: string[] }[]
  >(
    (initial.conditions as
      | { attribute_key: string; operator: string; values: string[] }[]
      | undefined) ?? [],
  );
  return (
    <form
      className="my-4 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2"
      onSubmit={handleSubmit((values) => {
        const data: Record<string, unknown> = {
          ...initial,
          ...values,
          organization_id: org,
          id: initial.id || crypto.randomUUID(),
          version: initial.version || 1,
        };
        for (const f of fields) {
          if (f.nullable && data[f.key] === '') data[f.key] = null;
          if (f.type === 'number') data[f.key] = Number(data[f.key]);
          if (f.type === 'datetime-local' && data[f.key])
            data[f.key] = new Date(String(data[f.key])).toISOString();
        }
        if (
          data.status === 'inactive' &&
          initial.status !== 'inactive' &&
          !window.confirm(
            'Deactivate this configuration? It will no longer be available for new pricing.',
          )
        )
          return;
        if (entity === 'catalog_items')
          for (const name of ['quantity', 'amount']) {
            data[name + '_rounding'] = {
              mode: data[name + '_mode'],
              step: data[name + '_step'],
            };
            delete data[name + '_mode'];
            delete data[name + '_step'];
          }
        if (entity === 'catalog_item_attributes') {
          data.conditions = conditions;
          delete data.dependency_parent;
          delete data.dependency_operator;
          delete data.dependency_option;
        }
        startTransition(async () => {
          const response = await saveCatalog(org, entity, data, replace);
          setMessage(response.message);
          if (response.id) {
            router.refresh();
            if (entity === 'catalog_items' && !initial.id)
              router.push('/dashboard/catalog/' + response.id);
          }
        });
      })}
    >
      <h3 className="text-lg font-semibold sm:col-span-2">{title}</h3>
      {fields
        .filter((f) => !f.key.startsWith('dependency_'))
        .map((f) => (
          <label key={f.key} className="grid gap-1 text-sm">
            {f.label}
            {f.choices ? (
              <select
                {...register(f.key)}
                required={f.required}
                multiple={f.type === 'multi'}
                className="w-full rounded border bg-background p-2"
              >
                {f.nullable && <option value="">None / default</option>}
                {f.choices.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                {...register(f.key)}
                className="rounded border p-2"
                maxLength={2000}
              />
            ) : (
              <input
                {...register(f.key)}
                type={f.type || 'text'}
                required={f.required}
                className="min-w-0 rounded border p-2"
                maxLength={2000}
                step={f.type === 'number' ? '1' : undefined}
              />
            )}
          </label>
        ))}
      {entity === 'catalog_item_attributes' && (
        <fieldset className="grid gap-4 rounded border p-3 sm:col-span-2">
          <legend>Visibility conditions (all must match)</legend>
          {conditions.map((condition, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-3">
              <label>
                Show when question
                <select
                  className="w-full rounded border p-2"
                  required
                  value={condition.attribute_key}
                  onChange={(e) =>
                    setConditions(
                      conditions.map((c, i) =>
                        i === index
                          ? { ...c, attribute_key: e.target.value, values: [] }
                          : c,
                      ),
                    )
                  }
                >
                  <option value="">Choose question</option>
                  {fields
                    .find((f) => f.key === 'dependency_parent')
                    ?.choices?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Condition
                <select
                  className="w-full rounded border p-2"
                  value={condition.operator}
                  onChange={(e) =>
                    setConditions(
                      conditions.map((c, i) =>
                        i === index
                          ? {
                              ...c,
                              operator: e.target.value,
                              values: c.values.slice(0, 1),
                            }
                          : c,
                      ),
                    )
                  }
                >
                  {['equals', 'not_equals', 'in', 'not_in'].map((op) => (
                    <option key={op} value={op}>
                      {op.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Condition options
                <select
                  className="w-full rounded border p-2"
                  required
                  multiple={['in', 'not_in'].includes(condition.operator)}
                  value={
                    ['in', 'not_in'].includes(condition.operator)
                      ? condition.values
                      : (condition.values[0] ?? '')
                  }
                  onChange={(e) =>
                    setConditions(
                      conditions.map((c, i) =>
                        i === index
                          ? {
                              ...c,
                              values: Array.from(e.target.selectedOptions)
                                .map((o) => o.value)
                                .filter(Boolean),
                            }
                          : c,
                      ),
                    )
                  }
                >
                  <option value="">Choose option</option>
                  {fields
                    .find((f) => f.key === 'dependency_option')
                    ?.choices?.filter(
                      (o) => o.parentKey === condition.attribute_key,
                    )
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                type="button"
                onClick={() =>
                  setConditions(conditions.filter((_, i) => i !== index))
                }
              >
                Remove condition
              </Button>
            </div>
          ))}
          <Button
            type="button"
            disabled={conditions.length >= 20}
            onClick={() =>
              setConditions([
                ...conditions,
                { attribute_key: '', operator: 'equals', values: [] },
              ])
            }
          >
            Add condition
          </Button>
        </fieldset>
      )}
      <div className="sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? 'Saving…' : title}
        </Button>
        <p role="status" className="mt-2">
          {message}
        </p>
      </div>
    </form>
  );
}
