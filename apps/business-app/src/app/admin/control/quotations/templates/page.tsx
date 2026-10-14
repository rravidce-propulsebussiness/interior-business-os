import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import type { ConstructionSpecSection } from '@business-os/core/construction-specifications';
import { PlatformConstructionTemplateEditor } from './template-studio';

export const dynamic = 'force-dynamic';

export default async function PlatformConstructionSpecTemplatesPage() {
  const { authorization, client } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission('platform.catalog.view');
    await authorization.requirePlatformPermission('platform.organizations.manage');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const { data, error } = await client.rpc('construction_spec_template_get', {});
  if (error) throw new Error('Platform specification defaults unavailable');
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link href="/admin/control/quotations" className="text-sm font-semibold text-blue-700">
        ← Quotation controls
      </Link>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
          Platform super admin · Configuration
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
          Construction package specification templates
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add or edit default categories, plan drawings, material fields, and
          custom rows. This configuration does not edit companies' package prices.
        </p>
      </div>
      <PlatformConstructionTemplateEditor
        initialSections={data as ConstructionSpecSection[]}
      />
    </main>
  );
}
