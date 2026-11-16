import { redirect } from 'next/navigation';

/** Retired CRM settings links return to the existing Leads workspace.
 * Source, stage, reason and lead requirement data are preserved.
 */
export default function LegacyCrmSettings() {
  redirect('/dashboard/crm/leads');
}
