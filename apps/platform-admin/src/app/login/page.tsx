import Link from 'next/link';
import { AuthForm } from '@business-os/ui/auth-form';
import { signIn } from '@business-os/auth/actions';
import { isSupabaseConfigured } from '@business-os/database/server';
export default function Login() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-3xl font-semibold">Sign in</h1>
      {!isSupabaseConfigured() && (
        <p role="status">
          Authentication setup is required before sign-in is available.
        </p>
      )}
      <AuthForm action={signIn} />
      <p className="mt-4">
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
