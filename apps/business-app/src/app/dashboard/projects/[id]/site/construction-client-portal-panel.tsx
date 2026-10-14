'use client';

import { useState, useTransition } from 'react';
import {
  createConstructionClientLink,
  publishConstructionReport,
  revokeConstructionClientLink,
  type ClientShareResult,
} from './construction-client-actions';

export type ConstructionClientManageData = {
  shares: {
    id: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    active: boolean;
  }[];
  reports: {
    id: string;
    report_date: string;
    completed_work: string;
    tomorrow_plan: string;
    approved: boolean;
    published: boolean;
  }[];
};

const actionStyle =
  'rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-xs font-bold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50';

export function ConstructionClientPortalManager({
  projectId,
  data,
}: {
  projectId: string;
  data: ConstructionClientManageData;
}) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const perform = (
    job: () => Promise<ClientShareResult>,
    onSuccess?: (result: ClientShareResult) => void,
  ) => {
    start(async () => {
      const outcome = await job();
      setNotice(outcome.message);
      if (outcome.saved) onSuccess?.(outcome);
    });
  };
  return (
    <section
      id="construction-client-updates"
      aria-label="Client progress sharing"
      className="sc-panel rounded-2xl border p-5 sm:p-7"
    >
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
        Customer progress portal
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">
        Share approved construction updates
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Customers can view floor and stage clearance, plus reports that the
        project manager explicitly publishes after reviewing the site engineer's
        updates. Contracts, prices, staff contacts, design files and unpublished
        reports remain private.
      </p>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-slate-900">
          Time-limited customer link
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Secure links expire after 30 days by default. Creating another link
          revokes earlier links for this project. Share the URL only with the
          intended customer.
        </p>
        <button
          className={'mt-3 ' + actionStyle}
          disabled={pending}
          onClick={() =>
            perform(
              () => createConstructionClientLink(projectId),
              (result) => {
                if (result.token)
                  setLink(window.location.origin + '/p/' + result.token);
              },
            )
          }
        >
          Create / rotate customer link
        </button>
        {link && (
          <div className="mt-4 space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              New link — displayed only now
              <input
                readOnly
                value={link}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-xs"
              />
            </label>
            <button
              className={actionStyle}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setNotice('Secure link copied.');
                } catch {
                  setNotice('Copy the link manually from the field above.');
                }
              }}
            >
              Copy link
            </button>
          </div>
        )}
        {data.shares.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.shares.slice(0, 5).map((share) => (
              <div
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="text-xs text-slate-700">
                  <p className="font-bold">
                    {share.active ? 'Active client link' : 'Expired or revoked'}
                  </p>
                  <p>
                    Expires: {share.expires_at.slice(0, 16).replace('T', ' ')}
                  </p>
                </div>
                {share.active && (
                  <button
                    className={actionStyle}
                    disabled={pending}
                    onClick={() =>
                      perform(
                        () => revokeConstructionClientLink(projectId, share.id),
                        () => setLink(''),
                      )
                    }
                  >
                    Revoke link
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5">
        <h3 className="text-base font-bold text-slate-900">
          Publish individual daily reports
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Approval alone does not make an update public. Review what the client
          will see, then publish each report. Withdrawing an update hides it
          immediately.
        </p>
        <div className="mt-3 space-y-3">
          {data.reports.length === 0 && (
            <p className="text-sm text-slate-600">
              No engineer daily reports recorded yet.
            </p>
          )}
          {data.reports.map((report) => (
            <article
              key={report.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {report.report_date}
                  </h4>
                  <p className="mt-1 text-xs text-slate-600">
                    {report.approved
                      ? 'Latest review approved'
                      : 'Manager approval required'}
                  </p>
                </div>
                <span
                  className={
                    'self-start rounded-full px-3 py-1 text-xs font-bold ' +
                    (report.published
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-100 text-slate-700')
                  }
                >
                  {report.published ? 'Published' : 'Private'}
                </span>
              </div>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Completed work
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {report.completed_work}
              </p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Tomorrow's work
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {report.tomorrow_plan}
              </p>
              <button
                className={'mt-3 ' + actionStyle}
                disabled={pending || (!report.published && !report.approved)}
                onClick={() =>
                  perform(() =>
                    publishConstructionReport(
                      projectId,
                      report.id,
                      !report.published,
                    ),
                  )
                }
              >
                {report.published
                  ? 'Unpublish customer update'
                  : 'Publish approved update'}
              </button>
            </article>
          ))}
        </div>
      </div>
      {notice && (
        <p className="mt-4 text-sm font-semibold text-blue-800" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
