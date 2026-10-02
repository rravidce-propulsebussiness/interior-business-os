'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { siteCommand } from './actions';
type Props =
  | {
      kind: 'task';
      id: string;
      version: number;
      status: string;
      progress: string;
    }
  | { kind: 'snag'; project: string }
  | { kind: 'stock'; project: string; location: string; lot: string };
export function SiteForm(props: Props) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState(''),
    [retryKey, setRetryKey] = useState<string | null>(null),
    router = useRouter();
  return (
    <form
      className="flex max-w-xl flex-wrap items-end gap-3 rounded-md border p-3"
      action={(form) => {
        start(async () => {
          let input: unknown;
          if (props.kind === 'task')
            input = {
              kind: 'task',
              id: props.id,
              version: props.version,
              status: form.get('status'),
              completion_percentage: form.get('progress'),
              reason: form.get('reason'),
            };
          else if (props.kind === 'snag')
            input = {
              kind: 'snag',
              project_id: props.project,
              title: form.get('title'),
              description: form.get('description'),
              priority: form.get('priority'),
            };
          else {
            const key = retryKey ?? crypto.randomUUID();
            setRetryKey(key);
            input = {
              kind: 'stock',
              operation: form.get('operation'),
              project_id: props.project,
              source_location_id: props.location,
              lot_id: props.lot,
              quantity: form.get('quantity'),
              reason: form.get('reason'),
              idempotency_key: key,
            };
          }
          const result = await siteCommand(input);
          setMessage(result.message);
          if (result.saved) {
            setRetryKey(null);
            router.refresh();
          }
        });
      }}
    >
      {props.kind === 'task' && (
        <>
          <label className="text-sm">
            Status
            <select
              name="status"
              defaultValue={props.status}
              className="block rounded border p-2"
            >
              {['todo', 'in_progress', 'blocked', 'done', 'cancelled'].map(
                (x) => (
                  <option key={x} value={x}>
                    {x.replaceAll('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-sm">
            Progress %
            <input
              className="block w-24 rounded border p-2"
              name="progress"
              defaultValue={props.progress}
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
            />
          </label>
        </>
      )}
      {props.kind === 'snag' && (
        <>
          <label className="w-full text-sm">
            Title
            <input
              className="block w-full rounded border p-2"
              name="title"
              maxLength={200}
              required
            />
          </label>
          <label className="w-full text-sm">
            Description
            <textarea
              className="block w-full rounded border p-2"
              name="description"
              maxLength={3000}
            />
          </label>
          <label className="text-sm">
            Priority
            <select className="block rounded border p-2" name="priority">
              {['low', 'medium', 'high', 'critical'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {props.kind === 'stock' && (
        <>
          <label className="text-sm">
            Record
            <select className="block rounded border p-2" name="operation">
              {['consumption', 'scrap', 'damage'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Quantity
            <input
              className="block w-32 rounded border p-2"
              name="quantity"
              inputMode="decimal"
              required
              pattern="[0-9]+(\.[0-9]{1,6})?"
            />
          </label>
        </>
      )}
      {props.kind !== 'snag' && (
        <label className="w-full text-sm">
          Reason
          <input
            name="reason"
            className="block w-full rounded border p-2"
            maxLength={3000}
            required={props.kind === 'stock'}
          />
        </label>
      )}
      <button
        disabled={pending}
        className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
