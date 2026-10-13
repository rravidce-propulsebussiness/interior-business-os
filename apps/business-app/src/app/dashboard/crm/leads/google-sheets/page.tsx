import { LeadImportPage } from '../import-page-shell';

export const dynamic = 'force-dynamic';

export default function GoogleSheetsPage() {
  return <LeadImportPage method="google" />;
}
