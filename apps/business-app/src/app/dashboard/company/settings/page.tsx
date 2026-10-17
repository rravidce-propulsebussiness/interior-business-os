import { redirect } from 'next/navigation';

/** Legacy URL. All company configuration is now consolidated in Settings. */
export default function OldCompanySettings() {
  redirect('/dashboard/settings?tab=company');
}
