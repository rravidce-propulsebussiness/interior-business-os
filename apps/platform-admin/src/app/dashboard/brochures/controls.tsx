'use client';
import { useState, useTransition } from 'react';
import type { Json } from '@business-os/database';
import { saveBrochurePlatform } from './actions';
export function BrochurePlatformControls({
  plans,
  brochures,
}: {
  plans: { id: string; name: string; configuration: Json }[];
  brochures: {
    id: string;
    name: string;
    organization: string;
    status: string;
  }[];
}) {
  const [plan, setPlan] = useState(plans[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const raw = plans.find((p) => p.id === plan)?.configuration;
  const config =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return (
    <div className="space-y-6">
      <form
        className="grid max-w-xl gap-4 rounded border p-5"
        action={(f) =>
          start(async () => {
            const values: Record<string, number | boolean> = {};
            for (const k of ['count', 'pages', 'storage_bytes'])
              values[k] = Number(f.get(k));
            for (const k of [
              'templates',
              'custom_design',
              'public_share',
              'analytics',
            ])
              values[k] = f.get(k) === 'on';
            setMessage(
              (await saveBrochurePlatform('plan', plan, values)).message,
            );
          })
        }
      >
        <label>
          Plan
          <select
            className="ml-4 rounded border p-2"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {(['count', 'pages', 'storage_bytes'] as const).map((k, i) => (
          <label className="grid gap-2" key={k}>
            {k}
            <input
              key={plan + k}
              name={k}
              type="number"
              min={1}
              required
              defaultValue={Number(config[k] ?? [20, 50, 104857600][i])}
              className="rounded border p-2"
            />
          </label>
        ))}
        {['templates', 'custom_design', 'public_share', 'analytics'].map(
          (k) => (
            <label key={k}>
              <input
                key={plan + k}
                type="checkbox"
                name={k}
                defaultChecked={Boolean(config[k] ?? k !== 'analytics')}
              />{' '}
              {k.replaceAll('_', ' ')}
            </label>
          ),
        )}
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Save plan capabilities
        </button>
      </form>
      <p role="status">{message}</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Business</th>
            <th>Brochure</th>
            <th>Status</th>
            <th>Control</th>
          </tr>
        </thead>
        <tbody>
          {brochures.map((b) => (
            <tr className="border-t" key={b.id}>
              <td className="py-3">{b.organization}</td>
              <td>{b.name}</td>
              <td>{b.status}</td>
              <td>
                <button
                  disabled={pending}
                  className="underline"
                  onClick={() =>
                    start(async () =>
                      setMessage(
                        (
                          await saveBrochurePlatform(
                            b.status === 'suspended' ? 'release' : 'suspend',
                            b.id,
                          )
                        ).message,
                      ),
                    )
                  }
                >
                  {b.status === 'suspended'
                    ? 'Release to unpublished'
                    : 'Suspend'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
