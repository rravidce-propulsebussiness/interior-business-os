'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';

export function ClientLoginForm({ action }: {
  action: (state: { message: string; authenticated?: boolean }, form: FormData) =>
    Promise<{ message: string; authenticated?: boolean }>;
}) {
  const [state, dispatch, busy] = useActionState(action, { message: '' });
  useEffect(() => {
    if (state.authenticated) window.location.replace('/client');
  }, [state.authenticated]);
  return (
    <form action={dispatch} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold text-slate-700">
        Your invited email
        <input name="email" type="email" required autoComplete="email"
          placeholder="you@example.com"
          className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-blue-600" />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Password
        <input name="password" type="password" required autoComplete="current-password"
          className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-blue-600" />
      </label>
      {state.message && <p className="text-sm text-red-700" role="alert">{state.message}</p>}
      <button disabled={busy} type="submit"
        className="min-h-12 w-full rounded-xl bg-blue-700 px-4 text-base font-bold text-white shadow-sm disabled:opacity-50">
        {busy ? 'Signing in…' : 'Open my projects'}
      </button>
      <p className="text-center text-sm text-slate-600">
        First time here? <Link className="font-semibold text-blue-700 underline"
          href="/client/register">Create client login</Link>
      </p>
      <p className="text-center text-sm">
        <Link className="text-blue-700 underline" href="/forgot-password">Forgot password?</Link>
      </p>
    </form>
  );
}
