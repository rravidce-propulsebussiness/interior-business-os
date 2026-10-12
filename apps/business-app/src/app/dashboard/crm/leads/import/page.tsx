import { redirect } from 'next/navigation';

/** Historic deep links now open the relevant tool inside the unified CRM. */
export default function PreviousLeadSection() {
  redirect('/dashboard/crm/leads?panel=sheet');
}
