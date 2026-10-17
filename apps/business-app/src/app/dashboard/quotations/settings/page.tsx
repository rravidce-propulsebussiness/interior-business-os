import { redirect } from 'next/navigation';

/** Keep bookmarked URLs working without displaying a duplicate settings form. */
export default function OldQuotationSettings() {
  redirect('/dashboard/settings?tab=branding');
}
