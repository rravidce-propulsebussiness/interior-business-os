import { redirect } from 'next/navigation';

/**
 * The Brochures module is retired from the Business OS workspace: it is no
 * longer in the menu and its pages send owners back to the dashboard.
 * Existing brochure data and published public brochure links (apps/websites)
 * are left untouched.
 */
export default function BrochuresLayout(): never {
  redirect('/dashboard');
}
