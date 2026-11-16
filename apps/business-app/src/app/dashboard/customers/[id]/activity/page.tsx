import { redirect } from 'next/navigation';

// Historical customer activities remain in Leads, Projects and Finance.
export default async function RetiredClientActivity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect('/dashboard/projects?customer=' + encodeURIComponent(id));
}
