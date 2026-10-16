'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { CommercialEntity } from '@business-os/core/commercial';
import { Button } from '@business-os/ui';
import { saveCommercial } from './actions';

async function photoDataUrl(file: File, limit: number): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 12_000_000)
    throw new Error('Choose a PNG or JPEG image under 12 MB.');
  const toData = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result)
        : reject(new Error('Image could not be read.'));
    reader.onerror = () => reject(new Error('Image could not be read.'));
    reader.readAsDataURL(blob);
  });
  if (file.size <= limit) return toData(file);
  // Keep PDF snapshots small, but let owners select normal phone photos.
  const bitmap = await createImageBitmap(file);
  try {
    const largest = Math.max(bitmap.width, bitmap.height);
    for (const maxEdge of [1400, 1100, 900, 720, 560, 440]) {
      const ratio = Math.min(1, maxEdge / largest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is unavailable.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.65, 0.50, 0.36]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= limit)
          return toData(blob);
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error('Unable to compress the image. Choose a smaller photograph.');
}

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
  fileMaxBytes?: number;
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
        if (entity === 'organization_quotation_settings' &&
          values.branding && typeof values.branding === 'object' &&
          JSON.stringify(values.branding).length > 190000) {
          setMessage('Logo and quotation photos exceed the 190 KB combined branding limit. Compress an image or replace the logo with a smaller file.');
          return;
        }
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
                setMessage('Optimizing photo…');
                void photoDataUrl(file, field.fileMaxBytes ?? 130000)
                  .then((dataUri) => {
                    setValue(field.key, dataUri, { shouldDirty: true });
                    setMessage('Photo ready. Save defaults to apply it to future quotations.');
                  })
                  .catch((error: unknown) => setMessage(
                    error instanceof Error ? error.message : 'Unable to prepare photo.'
                  ));
              }}            />
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
