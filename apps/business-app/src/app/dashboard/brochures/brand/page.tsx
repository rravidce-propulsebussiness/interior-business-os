import Link from 'next/link';
import { brochureServices } from '../service';
import { BrandEditor } from '../brand-editor';
export default async function Brand() {
  const s = await brochureServices('brochure.brand.manage', true);
  const data = await s.brochure.list();
  const assets = s.allowed('brochure.media.manage')
    ? await s.brochure.assets()
    : [];
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Link href="/dashboard/brochures" className="underline">
        ← Brochures
      </Link>
      <h1 className="text-3xl font-semibold">Brand & approved content</h1>
      <p className="text-sm text-muted-foreground">
        Business name comes from your organization: {String(data.business.name)}
        . Approve only information and images intended for public display.
        Published brochures retain a snapshot.
      </p>
      <BrandEditor
        initial={data.kit}
        initialVersion={data.kitVersion}
        assets={assets.map((a) => ({ id: String(a.id), name: String(a.name) }))}
      />
    </main>
  );
}
