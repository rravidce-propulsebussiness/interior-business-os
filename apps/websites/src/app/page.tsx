import { isSupabaseConfigured } from '@business-os/database/server';
import { notFound } from 'next/navigation';
import { FoundationPage } from '@business-os/ui';
import { currentWebsite, PublishedWebsite, websiteMetadata } from '../website';
export const dynamic = 'force-dynamic';
export const generateMetadata = () => websiteMetadata('/');
export default async function Page() {
  const site = await currentWebsite();
  if (site) return <PublishedWebsite site={site} path="/" />;
  if (isSupabaseConfigured()) notFound();
  return (
    <FoundationPage
      title="Business websites"
      description="The future delivery surface for published business websites."
    />
  );
}
