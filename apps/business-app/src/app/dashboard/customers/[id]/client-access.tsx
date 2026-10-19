'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
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
  lockedProject = false,
}: {
  customerId: string;
  customerEmail: string;
  projects: Project[];
  existing: Access[];
  lockedProject?: boolean;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [email, setEmail] = useState(customerEmail ?? '');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [access, setAccess] = useState(existing);
  // Client-side origin supports each company's future custom domain without
  // using a browser global during server rendering or causing hydration drift.
  const appOrigin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => 'https://sghomesinterior.in',
  );
  const portalUrl = projectId ? '/client/projects/' + projectId : '/client/login';

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
    <section id="client-portal-access" className="pv2-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2>Share with client</h2>
        <span className="text-xs text-slate-500">Private project access</span>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Invite the client's email to see this project's approved plans, updates and requests.
        They cannot view your company's dashboard or other projects.
      </p>
      {projects.length ? (
        <form
          className={lockedProject
            ? 'grid gap-3 md:grid-cols-[1fr_auto] md:items-end'
            : 'grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end'}
          onSubmit={(event) => {
            event.preventDefault();
            if (projectId && email.trim()) update(true, projectId, email.trim().toLowerCase());
          }}
        >
          {!lockedProject && <label className="flex flex-col gap-1 text-sm font-semibold">
            Project
            <select className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
              value={projectId} onChange={(event) => setProjectId(event.target.value)}
              required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Client email
            <input type="email" required value={email} maxLength={254}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
              placeholder="client@example.com"
              onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="min-h-11 rounded-xl bg-orange-600 px-5 font-semibold text-white disabled:opacity-50"
            disabled={pending} type="submit">
            {pending ? 'Saving…' : 'Share project'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          Project sharing is available for active projects linked to an active client.
          Check that the project and client are active.
        </p>
      )}
      {projects.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 p-3 text-sm">
        <span className="font-semibold">Client project link:</span>
        <a className="break-all text-orange-700 underline" href={portalUrl} target="_blank" rel="noreferrer">
          {portalUrl}
        </a>
        <button className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 font-semibold"
          type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin + portalUrl);
              setMessage('Selected project link copied. It works only for the invited, verified email.');
            } catch { setMessage('Copy the client link above.'); }
          }}>
          Copy link
        </button>
      </div>}
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
              <div className="flex flex-wrap items-center gap-2">
                {item.active && (
                  <button type="button" className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-orange-700"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          window.location.origin + '/client/projects/' + item.project_id
                        );
                        setMessage('Link copied for ' + item.project_name +
                          '. Only the invited client email can open it.');
                      } catch { setMessage('Copy the selected project link above.'); }
                    }}>
                    Copy project link
                  </button>
                )}
                {item.active && (
                  <a className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700"
                    href={'mailto:' + item.email + '?subject=' +
                      encodeURIComponent('Your project updates are ready') +
                      '&body=' + encodeURIComponent(
                        'You have been invited to view ' + item.project_name +
                        '. Open ' + appOrigin + '/client/projects/' + item.project_id +
                        ' and sign in or register using this invited email. This link does not grant access to any other project.',
                      )}>
                    Email client link
                  </a>
                )}
                <button type="button" disabled={pending}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() => update(!item.active, item.project_id, item.email)}>
                  {item.active ? 'Revoke access' : 'Restore access'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
