'use client';
import { useState, useTransition } from 'react';
import {
  addWebsiteDomain,
  checkWebsiteDomain,
  removeWebsiteDomain,
} from './domain-actions';
export function DomainPanel({
  site,
  base,
  domains,
  canManage,
}: {
  site: string;
  base: string;
  domains: {
    id: string;
    hostname: string;
    kind: string;
    status: string;
    challenge: string;
    tls_status: string;
    version: number;
  }[];
  canManage: boolean;
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      {canManage && (
        <form
          className="flex gap-3"
          action={(f) =>
            start(async () =>
              setMessage(
                (await addWebsiteDomain(site, String(f.get('hostname'))))
                  .message,
              ),
            )
          }
        >
          <input
            aria-label="Custom hostname"
            name="hostname"
            placeholder="www.yourbusiness.com"
            required
            maxLength={253}
            className="w-full rounded border p-3"
          />
          <button
            disabled={pending}
            className="shrink-0 rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Add domain
          </button>
        </form>
      )}
      {domains.map((d) => (
        <section key={d.id} className="rounded border p-5">
          <div className="flex justify-between">
            <h2 className="font-semibold">{d.hostname}</h2>
            <span className="text-sm capitalize">{d.status}</span>
          </div>
          <p className="mt-2 text-sm">HTTPS: {d.tls_status}</p>
          {d.kind === 'custom' && d.status !== 'removed' && (
            <>
              <dl className="mt-4 space-y-3 break-all text-sm">
                <div>
                  <dt className="font-semibold">
                    TXT · _business-os.{d.hostname}
                  </dt>
                  <dd className="mt-1 font-mono">
                    business-os-verification={d.challenge}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">CNAME · {d.hostname}</dt>
                  <dd>{base || 'Platform hostname has not been configured'}</dd>
                </div>
              </dl>
              {canManage && (
                <div className="mt-5 flex gap-4">
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () =>
                        setMessage(
                          (await checkWebsiteDomain(site, d.id)).message,
                        ),
                      )
                    }
                    className="rounded border px-3 py-2 text-sm"
                  >
                    Verify DNS and HTTPS
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () =>
                        setMessage(
                          (await removeWebsiteDomain(site, d.id, d.version))
                            .message,
                        ),
                      )
                    }
                    className="text-sm"
                  >
                    Remove domain
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ))}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
