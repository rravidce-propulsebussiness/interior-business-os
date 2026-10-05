'use client';
import { useActionState } from 'react';
import { Button } from './index';

export function RecoveryForm({
  action,
  setPassword = false,
  available = true,
}: {
  action: (
    state: { message: string },
    form: FormData,
  ) => Promise<{ message: string }>;
  setPassword?: boolean;
  available?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, { message: '' });
  return (
    <form action={dispatch} className="mt-6 grid max-w-md gap-4">
      <fieldset disabled={!available} className="contents">
        {setPassword ? (
          <>
            <label>
              New password
              <input
                className="mt-1 block w-full rounded border p-2"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <label>
              Confirm new password
              <input
                className="mt-1 block w-full rounded border p-2"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
          </>
        ) : (
          <label>
            Email
            <input
              className="mt-1 block w-full rounded border p-2"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
        )}
        <Button type="submit" disabled={pending || !available}>
          {pending
            ? 'Please wait…'
            : setPassword
              ? 'Set new password'
              : 'Send reset link'}
        </Button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}
