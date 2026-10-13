import { LeadImportPage } from '../import-page-shell';

export const dynamic = 'force-dynamic';

export default function UploadLeadsPage() {
  return <LeadImportPage method="file" />;
}
