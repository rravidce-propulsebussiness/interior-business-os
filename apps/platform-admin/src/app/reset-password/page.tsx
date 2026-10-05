import Link from 'next/link';
import { RecoveryForm } from '@business-os/ui/recovery-form';
import { setRecoveryPassword } from '@business-os/auth/recovery-actions';
import { pendingRecovery } from '@business-os/auth/recovery-server';
export default async function ResetPassword() {
  const pending = await pendingRecovery();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-3xl font-semibold">Set a new password</h1>
      {pending ? (
        <>
          <p>
            The link will be verified when you submit. You will need to sign in
            again.
          </p>
        </>
      ) : (
        <p>
          This reset link is unavailable or expired.{' '}
          <Link className="underline" href="/forgot-password">
            Request a new reset link
          </Link>
          .
        </p>
      )}
      <RecoveryForm
        action={setRecoveryPassword}
        setPassword
        available={Boolean(pending)}
      />
    </main>
  );
}
