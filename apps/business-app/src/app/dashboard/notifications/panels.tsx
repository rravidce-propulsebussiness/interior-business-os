'use client';
import { useState, useTransition } from 'react';
import { categories, preferenceSchema } from '@business-os/core/automation';
import { markNotification, savePreferences } from './actions';
export function NotificationControls({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: string;
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {(['read', 'unread', 'archived'] as const)
        .filter((s) => s !== status)
        .map((s) => (
          <button
            key={s}
            disabled={pending}
            className="rounded border px-3 py-1"
            onClick={() =>
              start(async () =>
                setMessage((await markNotification(id, version, s)).message),
              )
            }
          >
            {s === 'archived' ? 'Archive' : `Mark ${s}`}
          </button>
        ))}
      <span role="status">{message}</span>
    </div>
  );
}
export function Preferences({
  initial,
  version: initialVersion,
}: {
  initial: unknown;
  version: number;
}) {
  const [value, setValue] = useState(() => preferenceSchema.parse(initial));
  const [version, setVersion] = useState(initialVersion),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <form
      className="space-y-4 rounded border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await savePreferences(value, version);
          setMessage(result.message);
          if ('version' in result && result.version !== undefined)
            setVersion(result.version);
        });
      }}
    >
      <h2 className="text-lg font-semibold">Notification preferences</h2>
      <div className="flex gap-6">
        {(['inApp', 'email'] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.checked })}
            />{' '}
            {key === 'inApp' ? 'In-app notifications' : 'Email notifications'}
          </label>
        ))}
      </div>
      <fieldset>
        <legend className="font-medium">Categories</legend>
        <div className="flex flex-wrap gap-4">
          {categories.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={value.categories.includes(category)}
                onChange={(e) =>
                  setValue({
                    ...value,
                    categories: e.target.checked
                      ? [...value.categories, category]
                      : value.categories.filter((c) => c !== category),
                  })
                }
              />{' '}
              {category}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        Timezone
        <input
          className="ml-3 rounded border p-2"
          value={value.timezone}
          required
          onChange={(e) => setValue({ ...value, timezone: e.target.value })}
        />
      </label>
      <div className="flex gap-5">
        {(['quietStart', 'quietEnd'] as const).map((key) => (
          <label key={key}>
            {key === 'quietStart' ? 'Quiet hours start' : 'Quiet hours end'}
            <select
              className="ml-3 rounded border p-2"
              value={value[key] ?? ''}
              onChange={(e) =>
                setValue({
                  ...value,
                  [key]: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Off</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Set both quiet-hour boundaries. Delayed notifications are checked again
        when quiet hours end.
      </p>
      <button disabled={pending} className="rounded border px-4 py-2">
        Save preferences
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
