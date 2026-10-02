'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { CommercialEntity } from '@business-os/core/commercial';
import { Button } from '@business-os/ui';
import { saveCommercial } from './actions';

export interface Field {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'number'
    | 'textarea'
    | 'checkbox'
    | 'file'
    | 'date'
    | 'datetime-local'
    | 'tel';
  nullable?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
}
export function MasterForm({
  entity,
  initial,
  fields,
  title,
  submitAction,
  successPath,
}: {
  entity?: CommercialEntity;
  initial: Record<string, unknown>;
  fields: Field[];
  title: string;
  submitAction?: (
    input: Record<string, unknown>,
  ) => Promise<{ message: string; id?: string }>;
  successPath?: string;
}) {
  const {
    register,
    setValue,
    reset,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Record<string, unknown>>({ values: initial });
  const [message, setMessage] = useState(''),
    router = useRouter();
  return (
    <form
      className="my-5 grid max-w-2xl gap-4"
      onSubmit={handleSubmit(async (values) => {
        setMessage('');
        try {
          const result = submitAction
            ? await submitAction({ ...initial, ...values })
            : await saveCommercial(entity!, {
                ...initial,
                ...values,
                id: initial.id ?? crypto.randomUUID(),
              });
          setMessage(result.message);
          if (result.id) {
            if (successPath) {
              router.push(successPath.replace(':id', result.id));
              return;
            }
            if (!initial.id) reset(initial);
            router.refresh();
          }
        } catch {
          setMessage('Unable to save. Please try again.');
        }
      })}
    >
      {fields.map((field) => (
        <label className="grid gap-1" key={field.key}>
          {field.label}
          {field.options ? (
            <select
              className="rounded border bg-background p-2"
              {...register(field.key, {
                required: field.required ?? false,
                setValueAs: (value: unknown) =>
                  field.nullable && value === '' ? null : value,
              })}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === 'file' ? (
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  file.size > 130000 ||
                  !['image/png', 'image/jpeg'].includes(file.type)
                ) {
                  setMessage('Choose a PNG or JPEG logo smaller than 130 KB.');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string')
                    setValue(field.key, reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />
          ) : field.type === 'textarea' ? (
            <textarea
              className="rounded border bg-background p-2"
              rows={4}
              {...register(field.key, { required: field.required ?? false })}
            />
          ) : (
            <input
              className="rounded border bg-background p-2"
              type={field.type ?? 'text'}
              {...register(field.key, {
                required: field.required ?? false,
                valueAsNumber: field.type === 'number',
                setValueAs:
                  field.type === 'datetime-local'
                    ? (v: string) => (v ? new Date(v).toISOString() : null)
                    : field.nullable
                      ? (v: unknown) => (v === '' ? null : v)
                      : (v: unknown) => v,
              })}
            />
          )}
        </label>
      ))}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Saving…' : title}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
