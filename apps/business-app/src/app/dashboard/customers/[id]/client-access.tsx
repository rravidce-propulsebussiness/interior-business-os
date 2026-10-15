'use client';

import { useState, useTransition } from 'react';
import { setClientProjectAccess } from './client-access-actions';

type Access = {
  project_id: string;
  project_name: string;
  email: string;
  active: boolean;
  created_at: string;
};
type Project = { id: string; name: string };

export function ClientAccess({
  customerId,
  customerEmail,
  projects,
  existing,
}: {
  customerId: string;
  customerEmail: string;
  projects: Project[];
  existing: Access[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [email, setEmail] = useState(customerEmail ?? '');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [access, setAccess] = useState(existing);
  const portalUrl = typeof window === 'undefined'
    ? '/client/login' : window.location.origin + '/client/login';

  function update(active: boolean, targetProject: string, targetEmail: string) {
    setMessage('');
    start(async () => {
      const outcome = await setClientProjectAccess({
        customerId, projectId: targetProject, email: targetEmail, active,
      });
      setMessage(outcome.message);
      if (outcome.ok) {
        setAccess((current) => {
          const filtered = current.filter(
            (item) => !(item.project_id === targetProject && item.email === targetEmail),
          );
          return [{
            project_id: targetProject,
            project_name: projects.find((item) => item.id === targetProject)?.name ?? 'Project',
            email: targetEmail.toLowerCase(),
            active,
            created_at: new Date().toISOString(),
          }, ...filtered];
        });
      }
    });
  }

  return (
    <section id="client-portal-access" className="cp-panel cp-wide-panel">
      <div className="cp-section-heading">
        <h2>Client App Access</h2>
        <span className="cp-muted">Private project sharing</span>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Add your customer's email to a specific project. After verifying that
        email and signing in, they can follow site work, photos and design updates.
        This does not give them access to your business dashboard.
      </p>
      {projects.length ? (
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (projectId && email.trim()) update(true, projectId, email.trim().toLowerCase());
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Project
            <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
              value={projectId} onChange={(event) => setProjectId(event.target.value)}
              required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Client email
            <input type="email" required value={email} maxLength={254}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
              placeholder="client@example.com"
              onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="min-h-11 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-50"
            disabled={pending} type="submit">
            {pending ? 'Saving…' : 'Grant access'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          Client access becomes available when this customer has an active project.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3 text-sm">
        <span className="font-semibold">Client App:</span>
        <a className="break-all text-blue-800 underline" href="/client/login" target="_blank" rel="noreferrer">
          {portalUrl}
        </a>
        <button className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-semibold"
          type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin + '/client/login');
              setMessage('Client sign-in link copied. Share it with your customer.');
            } catch { setMessage('Copy the client link above.'); }
          }}>
          Copy link
        </button>
      </div>
      {message && <p className="mt-3 text-sm font-medium text-slate-700" role="status">{message}</p>}
      {access.length > 0 && (
        <div className="mt-5 space-y-2">
          <h3 className="font-semibold text-slate-900">People with project access</h3>
          {access.map((item) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              key={item.project_id + ':' + item.email}>
              <div>
                <strong className="text-sm">{item.email}</strong>
                <p className="text-xs text-slate-500">{item.project_name} · {item.active ? 'Active' : 'Revoked'}</p>
              </div>
              <button type="button" disabled={pending}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => update(!item.active, item.project_id, item.email)}>
                {item.active ? 'Revoke access' : 'Restore access'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
