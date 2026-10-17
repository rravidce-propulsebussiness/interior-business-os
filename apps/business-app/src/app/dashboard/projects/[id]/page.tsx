import { redirect } from 'next/navigation';

// Keep deep links from Leads, Quotations and notifications working during the reset.
export default function RetiredProjectDetailPage(): never {
 redirect('/dashboard/projects');
}
