import Link from 'next/link';
import { signUp } from '@business-os/auth/actions';
import { AuthForm } from '@business-os/ui/auth-form';

export default function ClientRegistration() {
  return (
    <main className="min-h-screen bg-orange-50/40 px-4 py-12">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-lg">
        <p className="text-sm font-bold tracking-widest text-orange-700">
          CLIENT APP
        </p>
        <h1 className="mt-3 text-2xl font-bold">
          Activate your client account
        </h1>
        <p className="my-5 text-sm leading-6 text-slate-600">
          Create an account using the exact email your project owner added.
          Confirm the verification email, then sign in to view your projects.
          You do not need to create a business organization.
        </p>
        <AuthForm action={signUp} registerAccount />
        <div className="mt-6 space-y-2 text-sm">
          <Link href="/client/login" className="block text-orange-700 underline">
            Already registered? Client sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
