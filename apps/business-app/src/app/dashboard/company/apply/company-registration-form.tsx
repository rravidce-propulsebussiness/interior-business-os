'use client';

import { useActionState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  submitCompanyApplication,
  type CompanyRegistrationState,
} from './actions';

export function CompanyRegistrationForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState<
    CompanyRegistrationState,
    FormData
  >(submitCompanyApplication, { message: '' });

  // A full navigation (not an RSC-only transition) refreshes server session
  // cookies and ensures the newly selected organization is picked up.
  useEffect(() => {
    if (state.organizationId) window.location.assign('/dashboard');
  }, [state.organizationId]);

  return (
    <form action={action} className="my-6 grid max-w-2xl gap-4">
      {children}
      <button
        type="submit"
        disabled={pending || Boolean(state.organizationId)}
        className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending
          ? 'Creating your workspace…'
          : state.organizationId
            ? 'Opening dashboard…'
            : 'Create my company'}
      </button>
      {state.message && (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"
        >
          <p>{state.message}</p>
          {state.organizationId && (
            <a className="mt-2 inline-block font-semibold text-blue-700 underline" href="/dashboard">
              Open your dashboard →
            </a>
          )}
          {state.pendingReview && (
            <p className="mt-2 text-slate-600">
              You can return here to check the application status.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
