import { redirect } from 'next/navigation';

/** Old import bookmark now opens the dedicated Upload Leads page. */
export default function LegacyUploadRedirect() {
  redirect('/dashboard/crm/leads/upload');
}
