import { redirect } from 'next/navigation';

/**
 * CRM overview used to duplicate the lead KPI cards and action queues.
 * Leads is the single CRM workspace and retains all underlying data.
 */
export default function CrmDashboard() {
  redirect('/dashboard/crm/leads');
}
