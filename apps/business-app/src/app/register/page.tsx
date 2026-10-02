import Link from 'next/link';
import { AuthForm } from '@business-os/ui/auth-form';
import { signUp } from '@business-os/auth/actions';
export default function Register() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p>
        Confirm your email before signing in. Creating an account does not grant
        platform access.
      </p>
      <AuthForm action={signUp} registerAccount />
      <Link href="/login">Sign in instead</Link>
    </main>
  );
}
