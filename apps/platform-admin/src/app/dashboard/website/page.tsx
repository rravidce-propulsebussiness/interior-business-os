import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { WebsitePlatformControls } from './controls';
export default async function PlatformWebsite() {
  const s = await pageServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await s.authorization.requirePlatformPermission('platform.catalog.view');
  const [settings, sites, plans, limits] = await Promise.all([
    s.client.from('website_platform_settings').select('*').single(),
    s.client.rpc('website_platform_list', {}),
    s.repository.plans(),
    s.client.from('website_plan_limits').select('plan_id,configuration'),
  ]);
  if (settings.error || sites.error || limits.error)
    throw new Error('Website platform settings unavailable');
  const rows = Array.isArray(sites.data)
    ? sites.data.filter(
        (
          x,
        ): x is {
          id: string;
          name: string;
          organization: string;
          status: string;
        } =>
          !!x &&
          typeof x === 'object' &&
          !Array.isArray(x) &&
          typeof x.id === 'string' &&
          typeof x.name === 'string' &&
          typeof x.organization === 'string' &&
          typeof x.status === 'string',
      )
    : [];
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <Link href="/dashboard" className="text-sm underline">
        Platform dashboard
      </Link>
      <h1 className="text-3xl font-semibold">Website platform</h1>
      <WebsitePlatformControls
        baseDomain={settings.data.base_domain ?? ''}
        managedTls={settings.data.managed_subdomain_tls}
        plans={plans.map((p) => {
          const raw = limits.data.find(
            (l) => l.plan_id === p.id,
          )?.configuration;
          const configuration: Record<string, number | boolean> = {};
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const [key, value] of Object.entries(raw)) {
              if (typeof value === 'number' || typeof value === 'boolean')
                configuration[key] = value;
            }
          }
          return { ...p, configuration };
        })}
        allowedEmbeds={
          Array.isArray(settings.data.allowed_embeds)
            ? settings.data.allowed_embeds.filter(
                (x): x is string => typeof x === 'string',
              )
            : []
        }
        disabledComponents={
          Array.isArray(settings.data.disabled_components)
            ? settings.data.disabled_components.filter(
                (x): x is string => typeof x === 'string',
              )
            : []
        }
        sites={rows}
      />
    </main>
  );
}
