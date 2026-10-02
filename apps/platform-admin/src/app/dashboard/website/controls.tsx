'use client';
import { useState, useTransition } from 'react';
import { savePlatformWebsite } from './actions';
export function WebsitePlatformControls({
  baseDomain,
  managedTls,
  plans,
  sites,
  allowedEmbeds,
  disabledComponents,
}: {
  baseDomain: string;
  managedTls: boolean;
  plans: {
    id: string;
    name: string;
    configuration?: Record<string, number | boolean>;
  }[];
  allowedEmbeds: string[];
  disabledComponents: string[];
  sites: { id: string; name: string; organization: string; status: string }[];
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition(),
    [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? '');
  const selectedConfig =
    plans.find((p) => p.id === selectedPlan)?.configuration ?? {};
  return (
    <div className="space-y-8">
      <form
        className="grid max-w-xl gap-4 rounded border p-5"
        action={(f) =>
          start(async () =>
            setMessage(
              (
                await savePlatformWebsite('settings', {
                  baseDomain: String(f.get('baseDomain')),
                  managedTls: f.get('tls') === 'on',
                  allowedEmbeds: String(f.get('embeds'))
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                  disabledComponents: String(f.get('components'))
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              ).message,
            ),
          )
        }
      >
        <h2 className="font-semibold">Platform subdomains</h2>
        <label>
          Base hostname
          <input
            className="mt-1 block w-full rounded border p-2"
            name="baseDomain"
            required
            defaultValue={baseDomain}
            placeholder="sites.example.com"
          />
        </label>
        <label className="text-sm">
          <input type="checkbox" name="tls" defaultChecked={managedTls} />{' '}
          Wildcard routing and HTTPS have been configured
        </label>
        <label className="text-sm">
          Allowed embed hostnames (comma separated)
          <input
            name="embeds"
            className="mt-1 w-full rounded border p-2"
            defaultValue={allowedEmbeds.join(', ')}
          />
        </label>
        <label className="text-sm">
          Disabled component types (comma separated)
          <input
            name="components"
            className="mt-1 w-full rounded border p-2"
            defaultValue={disabledComponents.join(', ')}
          />
        </label>
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Save platform domain
        </button>
      </form>
      <form
        className="grid max-w-xl gap-4 rounded border p-5"
        action={(f) =>
          start(async () => {
            const config: Record<string, number | boolean> = {};
            for (const key of ['sites', 'pages', 'storage_bytes'])
              config[key] = Number(f.get(key));
            for (const key of [
              'forms',
              'custom_domain',
              'custom_code',
              'developer_mode',
              'analytics',
              'integrations',
            ])
              config[key] = f.get(key) === 'on';
            setMessage(
              (
                await savePlatformWebsite('plan', {
                  planId: String(f.get('plan')),
                  configuration: config,
                })
              ).message,
            );
          })
        }
      >
        <h2 className="font-semibold">Website plan capabilities</h2>
        <select
          aria-label="Plan"
          name="plan"
          className="rounded border p-2"
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {['sites', 'pages', 'storage_bytes'].map((k, i) => (
          <label key={k} className="text-sm">
            {k}
            <input
              name={k}
              type="number"
              min="1"
              required
              className="mt-1 block w-full rounded border p-2"
              key={selectedPlan + k}
              defaultValue={Number(selectedConfig[k] ?? [3, 50, 52428800][i])}
            />
          </label>
        ))}
        <div className="grid grid-cols-2 gap-3">
          {[
            'forms',
            'custom_domain',
            'custom_code',
            'developer_mode',
            'analytics',
            'integrations',
          ].map((k) => (
            <label key={k} className="text-sm">
              <input
                key={selectedPlan + k}
                type="checkbox"
                name={k}
                defaultChecked={Boolean(selectedConfig[k] ?? k === 'forms')}
              />{' '}
              {k.replaceAll('_', ' ')}
            </label>
          ))}
        </div>
        <button
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          Save plan capabilities
        </button>
      </form>
      <section>
        <h2 className="mb-4 font-semibold">Website delivery status</h2>
        {sites.map((site) => (
          <form
            key={site.id}
            className="mb-3 flex flex-wrap items-center gap-3 rounded border p-4"
            action={(f) =>
              start(async () =>
                setMessage(
                  (
                    await savePlatformWebsite(
                      site.status === 'suspended' ? 'resume' : 'suspend',
                      { websiteId: site.id, reason: String(f.get('reason')) },
                    )
                  ).message,
                ),
              )
            }
          >
            <div className="min-w-48 flex-1">
              <h3>{site.name}</h3>
              <p className="text-sm text-muted-foreground">
                {site.organization} · {site.status}
              </p>
            </div>
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Reason"
              aria-label={`Reason for ${site.name}`}
              className="rounded border p-2"
            />
            <button
              disabled={pending}
              className="rounded border px-3 py-2 text-sm"
            >
              {site.status === 'suspended'
                ? 'Release to unpublished'
                : 'Suspend website'}
            </button>
          </form>
        ))}
      </section>
      <p role="status">{message}</p>
    </div>
  );
}
