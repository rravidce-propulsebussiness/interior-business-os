import { redirect } from 'next/navigation';

// Old Clients bookmarks open the single Projects workspace.
export default function RetiredClientsPage() {
  redirect('/dashboard/projects');
}
