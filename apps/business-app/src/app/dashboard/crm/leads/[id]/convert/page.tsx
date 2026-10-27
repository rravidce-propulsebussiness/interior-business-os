import { redirect } from 'next/navigation';
import { idSchema } from '@business-os/shared';

// Legacy URL remains a redirect for bookmarks. Conversion is now initiated
// directly from the Won lead on mobile and desktop; no duplicate form/page.
export default async function LegacyConvert({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  idSchema.parse(id);
  redirect('/dashboard/crm/leads/' + encodeURIComponent(id));
}
