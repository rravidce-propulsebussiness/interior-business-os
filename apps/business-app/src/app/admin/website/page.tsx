import Link from 'next/link';
import { pageServices } from '@business-os/auth/server';
import { WebsitePlatformControls } from './controls';
import { websiteSchemaPending } from '../../../website-schema';
import { TemplateCreate } from './template-create';
export default async function PlatformWebsite() {
  const s = await pageServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await s.authorization.requirePlatformPermission('platform.catalog.view');
  const [settings, sites, plans, limits, templates] = await Promise.all([
    s.client.from('website_platform_settings').select('*').single(),
    s.client.rpc('website_platform_list', {}),
    s.repository.plans(),
    s.client.from('website_plan_limits').select('plan_id,configuration'),
    s.client
      .from('website_templates')
      .select('id,name,description,status,version')
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);
  const pendingSetup = websiteSchemaPending(templates.error);
  const templateRows = templates.data ?? [];
  if (
    settings.error ||
    sites.error ||
    limits.error ||
    (templates.error && !pendingSetup)
  )
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
      <Link href="/admin" className="text-sm underline">
        Platform dashboard
      </Link>
      <h1 className="text-3xl font-semibold">
        Website Builder &amp; Templates
      </h1>
      <p className="text-muted-foreground">
        Create themes, page layouts and custom-code templates. Publish a
        template so business owners can use it as an editable starting point for
        their own website.
      </p>
      <Link
        href="/admin/domains"
        className="inline-block rounded border px-4 py-2"
      >
        Configure company URLs and domains →
      </Link>
      {pendingSetup ? (
        <p role="status" className="rounded border p-4 text-sm">
          Template library setup is pending. Existing website controls remain
          available. The administrator must install the website templates
          migration.
        </p>
      ) : (
        <TemplateCreate />
      )}
      <section
        aria-label="Template library"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {templateRows.map((template) => (
          <Link
            className="rounded-xl border bg-card p-5 hover:border-primary"
            key={template.id}
            href={`/admin/website/templates/${template.id}`}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {template.status} · v{template.version}
            </p>
            <h2 className="mt-3 text-lg font-semibold">{template.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {template.description || 'Editable pages, theme and custom code.'}
            </p>
            <p className="mt-5 text-sm">Open template studio →</p>
          </Link>
        ))}
        {!pendingSetup && !templateRows.length && (
          <p className="text-sm text-muted-foreground">
            Create your first template above. Company websites remain separate
            from shared templates.
          </p>
        )}
      </section>
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
