'use client';
import { useState, useTransition } from 'react';
import {
  grantConstructionClientAccess,
  revokeConstructionClientAccess,
} from './construction-client-access-actions';

export type ClientAccessData = {
  members: { id: string; email: string; active: boolean; version: number }[];
};

const buttonStyle =
  'rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50';

export function ConstructionClientAccessPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: ClientAccessData;
}) {
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <section
      className="sc-panel rounded-2xl border p-5 sm:p-7"
      aria-label="Verified homeowner access"
    >
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
        Verified client accounts
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">
        Give the homeowner private access
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        The client must first create an account and verify their email. Grant
        only their CRM customer email or primary contact email. Access is
        limited to this project and published progress, not employee tools.
      </p>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await grantConstructionClientAccess(
              projectId,
              email,
            );
            setMessage(result.message);
            if (result.saved) setEmail('');
          });
        }}
      >
        <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
          Registered and verified client email
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            placeholder="client@example.com"
          />
        </label>
        <button className={buttonStyle + ' self-end'} disabled={pending}>
          Grant access
        </button>
      </form>
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {data.members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-slate-800">
                {member.email}
              </p>
              <p className="text-xs text-slate-500">
                {member.active ? 'Active on this project' : 'Revoked'}
              </p>
            </div>
            {member.active && (
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await revokeConstructionClientAccess(
                      projectId,
                      member.id,
                      member.version,
                    );
                    setMessage(result.message);
                  })
                }
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {data.members.length === 0 && (
          <p className="text-sm text-slate-600">
            No verified client users assigned yet.
          </p>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        After signing in, the homeowner can visit /client/projects. Revocation
        is effective at the next server request.
      </p>
    </section>
  );
}
