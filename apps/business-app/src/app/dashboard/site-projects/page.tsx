import { redirect } from 'next/navigation';
// One Projects directory, even when the user originally opened "My Sites".
export default function FormerMySitesPage():never{
 redirect('/dashboard/projects');
}
