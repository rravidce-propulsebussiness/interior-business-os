'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addWebsiteDomain,
  checkWebsiteDomain,
  removeWebsiteDomain,
} from './domain-actions';

type DnsRecord = { type: 'TXT'; name: string; value: string };

export function DomainPanel({
  site,
  cnameTarget,
  domains,
  canManage,
  customDomainEnabled,
  saasReady,
  organizationId,
}: {
  organizationId?: string;
  site: string;
  cnameTarget: string;
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
  customDomainEnabled: boolean;
  saasReady: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-5">
      {canManage && customDomainEnabled && saasReady && (
        <form
          className="flex flex-wrap gap-3"
          action={(form) =>
            start(async () => {
              const result = await addWebsiteDomain(
                site,
                String(form.get('hostname') ?? ''),
                organizationId,
              );
              setMessage(result.message);
              setRecords(result.records);
              router.refresh();
            })
          }
        >
          <input
            aria-label="Custom hostname"
            name="hostname"
            placeholder="www.yourbusiness.com or yourbusiness.com"
            required
            maxLength={253}
            className="min-w-0 flex-1 rounded border p-3"
          />
          <button
            disabled={pending}
            className="shrink-0 rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Add custom domain
          </button>
        </form>
      )}

      {!customDomainEnabled && (
        <p role="status" className="rounded border p-4 text-sm">
          Custom domains are not included in your current website plan. Ask your
          Business OS administrator to enable the Custom Domain plan feature.
        </p>
      )}
      {customDomainEnabled && !saasReady && (
        <p role="status" className="rounded border p-4 text-sm">
          The platform custom-domain gateway is not configured yet. The
          administrator must enable Cloudflare for SaaS and configure its
          fallback origin before custom domains can be connected.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Connect either your root domain (yourbusiness.com) or a subdomain
        (www.yourbusiness.com). You can add both to the same website; each
        hostname is verified separately. Your domain remains registered with
        your existing domain provider.
      </p>

      {domains.map((domain) => (
        <section key={domain.id} className="space-y-3 rounded border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="break-all font-semibold">{domain.hostname}</h2>
            <span className="text-sm capitalize">
              {domain.status} · HTTPS {domain.tls_status}
            </span>
          </div>

          {domain.kind === 'custom' && domain.status !== 'removed' && (
            <>
              <div className="rounded bg-muted/40 p-3 text-sm">
                <p className="font-semibold">1. Verify domain ownership</p>
                <p className="mt-1 break-all font-mono">
                  TXT · _business-os.{domain.hostname}
                </p>
                <p className="mt-1 break-all font-mono">
                  business-os-verification={domain.challenge}
                </p>
              </div>

              <div className="rounded bg-muted/40 p-3 text-sm">
                <p className="font-semibold">2. Point the hostname to Business OS</p>
                <p className="mt-1">
                  For a subdomain such as <code>www</code>, create a CNAME
                  record for that subdomain. For a root/apex hostname, use an
                  ALIAS/ANAME record or your DNS provider's CNAME flattening on
                  host <code>@</code>. In both cases the target is{' '}
                  <code>{cnameTarget || 'CNAME target not configured'}</code>.
                  A-only DNS providers require a separate apex-proxying service.
                </p>
                <p className="mt-2 text-muted-foreground">
                  For a subdomain such as www, use a CNAME. If your DNS provider
                  is Cloudflare, leave the customer record DNS-only (grey cloud)
                  unless your Cloudflare for SaaS setup explicitly supports
                  proxying/O2O.
                </p>
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={pending || !customDomainEnabled || !saasReady}
                    onClick={() =>
                      start(async () => {
                        const result = await checkWebsiteDomain(
                          site,
                          domain.id,
                          organizationId,
                        );
                        setMessage(result.message);
                        setRecords(result.records);
                        router.refresh();
                      })
                    }
                    className="rounded border px-3 py-2 text-sm"
                  >
                    {domain.status === 'active' && domain.tls_status === 'ready'
                      ? 'Recheck domain'
                      : 'Verify DNS and HTTPS'}
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await removeWebsiteDomain(
                          site,
                          domain.id,
                          domain.version,
                          organizationId,
                        );
                        setMessage(result.message);
                        router.refresh();
                      })
                    }
                    className="text-sm underline"
                  >
                    Remove domain
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ))}

      {records.length > 0 && (
        <section className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Additional Cloudflare validation records
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Add these TXT records at your domain provider if Cloudflare requests
            them. They are separate from the Business OS ownership TXT record.
          </p>
          <dl className="space-y-2 break-all text-sm">
            {records.map((record) => (
              <div key={record.name + record.value}>
                <dt className="font-semibold">{record.type} · {record.name}</dt>
                <dd className="font-mono">{record.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p role="status" className="text-sm">{message}</p>
    </div>
  );
}
