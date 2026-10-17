import { redirect } from 'next/navigation';

// Former assigned-site list is retired with the Projects workspace.
export default function RetiredAssignedSitesPage(): never {
 redirect('/dashboard/projects');
}
