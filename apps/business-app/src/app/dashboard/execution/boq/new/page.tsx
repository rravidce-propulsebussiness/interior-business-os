import ManualBoqPage from '../page';

export const dynamic = 'force-dynamic';

export default async function CreateBoqPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const query = await searchParams;
  return (
    <ManualBoqPage
      searchParams={Promise.resolve({ project: query.project, mode: 'new' })}
    />
  );
}
