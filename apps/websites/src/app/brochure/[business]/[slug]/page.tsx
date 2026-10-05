import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicBrochure } from '../../../../brochure';
import { BrochureViewer } from './viewer';
export const dynamic = 'force-dynamic';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ business: string; slug: string }>;
}): Promise<Metadata> {
  const { business, slug } = await params;
  const b = await publicBrochure(business, slug);
  if (!b) return { robots: { index: false, follow: false } };
  const d = b.document;
  const origin = process.env.BROCHURE_PUBLIC_ORIGIN;
  const canonical =
    d.settings.canonical ||
    (origin
      ? new URL(`/brochure/${business}/${slug}`, origin).toString()
      : undefined);
  return {
    title: { absolute: d.settings.seoTitle || d.title },
    description: d.settings.seoDescription || d.description,
    robots: { index: d.settings.index, follow: d.settings.index },
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title: d.settings.seoTitle || d.title,
      description: d.settings.seoDescription || d.description,
      ...(d.settings.cover && origin
        ? {
            images: [
              new URL(
                `/brochure/${business}/${slug}/assets/${d.settings.cover}`,
                origin,
              ).toString(),
            ],
          }
        : {}),
    },
  };
}
export default async function BrochurePage({
  params,
}: {
  params: Promise<{ business: string; slug: string }>;
}) {
  const { business, slug } = await params;
  const b = await publicBrochure(business, slug);
  if (!b) notFound();
  return (
    <BrochureViewer
      document={b.document}
      sequence={b.sequence}
      businessName={b.businessName}
      formsEnabled={b.formsEnabled}
      base={`/brochure/${business}/${slug}`}
    />
  );
}
