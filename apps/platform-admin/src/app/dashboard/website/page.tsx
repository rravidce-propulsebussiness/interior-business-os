import { redirect } from 'next/navigation';

export default function PlatformWebsite() {
  // Platform infrastructure remains under Domain Management.
  // Business website editing belongs to the tenant workspace.
  redirect('/dashboard/domains');
}
