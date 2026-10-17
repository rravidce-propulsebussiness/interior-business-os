import { redirect } from 'next/navigation';

// The obsolete Site Delivery UI has been retired, not its data or authorized APIs.
export default function RetiredSiteDeliveryPage(): never {
 redirect('/dashboard/projects');
}
