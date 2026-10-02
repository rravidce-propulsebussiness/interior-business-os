'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@business-os/ui';
import { quotationCommand } from './actions';
import type { Field } from '../commercial/master-form';
export function CommandForm({
  initial,
  title,
  fields = [],
}: {
  initial: Record<string, unknown>;
  title: string;
  fields?: Field[];
}) {
  const {
      register,
      handleSubmit,
      formState: { isSubmitting },
    } = useForm<Record<string, unknown>>({ values: initial }),
    [message, setMessage] = useState(''),
    router = useRouter();
  return (
    <form
      className="my-4 grid max-w-2xl gap-3"
      onSubmit={handleSubmit(async (values) => {
        try {
          const r = await quotationCommand({ ...initial, ...values });
          setMessage(r.message);
          if (r.id) {
            if (initial.action === 'create' || initial.action === 'clone')
              router.push(`/dashboard/quotations/${r.id}`);
            else router.refresh();
          }
        } catch {
          setMessage('Unable to update quotation.');
        }
      })}
    >
      {fields.map((f) => (
        <label className="grid gap-1" key={f.key}>
          {f.label}
          {f.options ? (
            <select
              className="rounded border bg-background p-2"
              {...register(f.key, {
                setValueAs: (value: unknown) =>
                  f.nullable && value === '' ? null : value,
              })}
            >
              {f.options.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea
              rows={5}
              className="rounded border bg-background p-2"
              {...register(f.key)}
            />
          ) : (
            <input
              type={f.type ?? 'text'}
              className="rounded border bg-background p-2"
              {...register(f.key, {
                required: f.required ?? false,
                valueAsNumber: f.type === 'number',
              })}
            />
          )}
        </label>
      ))}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Working…' : title}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
