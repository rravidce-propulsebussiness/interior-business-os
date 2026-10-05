import Link from 'next/link';
import { RecoveryForm } from '@business-os/ui/recovery-form';
import { requestPasswordReset } from '@business-os/auth/recovery-actions';
export default function ForgotPassword() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      <p>Enter your email address to request a reset link.</p>
      <RecoveryForm action={requestPasswordReset} />
      <p className="mt-4">
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
