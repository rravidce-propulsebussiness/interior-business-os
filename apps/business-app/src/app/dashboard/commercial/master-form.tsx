'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { CommercialEntity } from '@business-os/core/commercial';
import { Button } from '@business-os/ui';
import { saveCommercial } from './actions';

async function photoDataUrl(file: File, limit: number): Promise<string> {
  if (
    !['image/png', 'image/jpeg'].includes(file.type) ||
    file.size > 12_000_000
  )
    throw new Error('Choose a PNG or JPEG image under 12 MB.');
  const toData = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
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
      for (const quality of [0.78, 0.65, 0.5, 0.36]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (blob && blob.size <= limit) return toData(blob);
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
    watch,
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
        if (
          entity === 'organization_quotation_settings' &&
          values.branding &&
          typeof values.branding === 'object' &&
          JSON.stringify(values.branding).length > 190000
        ) {
          setMessage(
            'Logo and quotation photos exceed the 190 KB combined branding limit. Compress an image or replace the logo with a smaller file.',
          );
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
        <label
          className="grid gap-2 rounded-xl border border-slate-100 bg-white px-3 py-3 text-sm font-semibold text-slate-800"
          key={field.key}
        >
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
            <div className="grid gap-2">
              {typeof watch(field.key) === 'string' &&
                /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(
                  watch(field.key) as string,
                ) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <img
                      src={watch(field.key) as string}
                      alt={field.label + ' currently saved'}
                      className="h-20 w-28 rounded-lg border border-slate-200 bg-white object-contain p-1"
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                      onClick={() => {
                        setValue(field.key, '', { shouldDirty: true });
                        setMessage(
                          'Image cleared. Save company branding to apply the removal.',
                        );
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                )}
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
                      setMessage(
                        'Photo ready. Save defaults to apply it to future quotations.',
                      );
                    })
                    .catch((error: unknown) =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'Unable to prepare photo.',
                      ),
                    );
                }}
                className="block w-full rounded-xl border border-dashed border-orange-200 bg-orange-50/40 p-3 text-xs text-slate-700"
                aria-label={field.label}
              />
            </div>
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
