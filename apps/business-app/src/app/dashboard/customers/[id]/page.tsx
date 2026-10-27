import { redirect } from 'next/navigation';

// Customer identity is retained in the database; only the duplicate page
// was retired. Preserve existing links by opening this customer's projects.
export default async function RetiredClientAccount({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect('/dashboard/projects?customer=' + encodeURIComponent(id));
}
