import { redirect } from 'next/navigation';

/** Keep existing links working without maintaining a separate lead creation page. */
export default function NewLeadLegacyRedirect() {
  redirect('/dashboard/crm/leads?panel=add');
}
