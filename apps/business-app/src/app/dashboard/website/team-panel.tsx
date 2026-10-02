'use client';
import { useState, useTransition } from 'react';
import { updateWebsiteMember } from './team-actions';
export function WebsiteTeam({
  site,
  members,
}: {
  site: string;
  members: { id: string; name: string; assigned: boolean }[];
}) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Website Developer grants website permissions only. Other roles the
        member already holds are unchanged.
      </p>
      {members.map((m) => (
        <div
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"
        >
          <span>{m.name}</span>
          <div className="flex gap-4 text-sm">
            <button
              disabled={pending}
              className="rounded border px-3 py-2"
              onClick={() =>
                start(async () =>
                  setMessage(
                    (await updateWebsiteMember(site, m.id, 'developer'))
                      .message,
                  ),
                )
              }
            >
              Grant Website Developer
            </button>
            <button
              disabled={pending}
              onClick={() =>
                start(async () =>
                  setMessage(
                    (
                      await updateWebsiteMember(
                        site,
                        m.id,
                        m.assigned ? 'remove' : 'assign',
                      )
                    ).message,
                  ),
                )
              }
            >
              {m.assigned ? 'Remove website scope' : 'Assign website scope'}
            </button>
          </div>
        </div>
      ))}
      <p role="status">{message}</p>
    </div>
  );
}
