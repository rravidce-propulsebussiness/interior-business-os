import { redirect } from 'next/navigation';

export default function CreateUserRedirect() {
  // Individual user onboarding moved into new organization creation.
  redirect('/admin/organizations/create');
}
