import { redirect } from 'next/navigation';
export default async function WebsiteLanding() {
  // Old website entry URL now consistently opens the template gallery.
  // The saved website is pinned first there; Edit opens /layout.
  redirect('/dashboard/website');
}
