import { notFound } from 'next/navigation';
import { isPropulsePrivacyPage, privacyPolicyMetadata, PrivacyPolicyContent } from '../privacy-policy-content';
import {
  currentWebsite, PublishedWebsite, websiteMetadata,
} from '../../../../../websites/src/website';

export const dynamic = 'force-dynamic';

type PublicSiteParams = { path?: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<PublicSiteParams>;
}) {
  const path = '/' + ((await params).path ?? []).join('/');
  const site = await currentWebsite();
  if (isPropulsePrivacyPage(site?.host, path)) return privacyPolicyMetadata();
  return websiteMetadata(path);
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<PublicSiteParams>;
}) {
  const path = '/' + ((await params).path ?? []).join('/');
  const site = await currentWebsite();
  if (!site) notFound();
  if (isPropulsePrivacyPage(site.host, path)) {
    return (
      <div className="public-website-root">
        <PrivacyPolicyContent />
      </div>
    );
  }
  if (!site.build.document.pages.some((page) => page.path === path)) notFound();
  return (
    <div className="public-website-root">
      <PublishedWebsite site={site} path={path} />
    </div>
  );
}
