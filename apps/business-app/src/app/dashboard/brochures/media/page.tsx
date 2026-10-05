import Link from 'next/link';
import { brochureServices } from '../service';
import { MediaLibrary } from '../panels';
export default async function Media({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await brochureServices('brochure.media.manage', true);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const assets = await s.brochure.assets(page);
  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Link className="underline" href="/dashboard/brochures">
        ← Brochures
      </Link>
      <h1 className="text-3xl font-semibold">Image library</h1>
      <p className="text-sm text-muted-foreground">
        Original image dimensions are retained. Cropping and focal points are
        nondestructive layout settings. Upload only images approved for public
        use.
      </p>
      <MediaLibrary
        assets={assets.map((a) => ({
          id: String(a.id),
          name: String(a.name),
          width: Number(a.width) || null,
          height: Number(a.height) || null,
        }))}
      />
      <nav className="flex gap-4 underline">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {assets.length === 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </nav>
    </main>
  );
}
