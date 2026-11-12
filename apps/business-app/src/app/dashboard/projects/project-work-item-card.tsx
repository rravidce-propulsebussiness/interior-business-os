'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateWorkItem } from './[id]/site/work-item-actions';
import { MaterialRequestSheet } from './project-material-request-sheet';
import type { BoqItem } from './project-v2-data';

export type WorkItemView = {
  key: string;
  stageId: string;
  index: number;
  title: string;
  stageLabel: string;
  status: string;
  stageStatus: string;
  blockers: string[];
  optional: boolean;
  assigneeId: string | null;
  assigneeLabel: string;
  crew: string;
  skipReason: string;
  measurements: { label: string; value: string; unit: string }[];
  prompts: { label: string; unit: string }[];
  planned: string;
  hasPhoto: boolean;
  openMaterials: number;
};

const statusText: Record<string, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  on_hold: 'Paused',
  completed: 'Done',
  skipped: 'Not applicable',
};

export function WorkItemCard({
  projectId,
  item,
  canWork,
  canOwn,
  canRequest,
  engineers,
  boq,
  tomorrow,
}: {
  projectId: string;
  item: WorkItemView;
  canWork: boolean;
  canOwn: boolean;
  canRequest: boolean;
  engineers: { id: string; label: string }[];
  boq: BoqItem[];
  tomorrow: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [panel, setPanel] = useState<
    '' | 'complete' | 'measure' | 'material' | 'owner'
  >('');
  const stageActive = item.stageStatus === 'in_progress';
  const done = item.status === 'completed' || item.status === 'skipped';
  const rows = item.prompts.length
    ? item.prompts.map((p) => ({
        ...p,
        value: item.measurements.find((m) => m.label === p.label)?.value ?? '',
      }))
    : [];
  const extra = item.measurements.filter(
    (m) => !item.prompts.some((p) => p.label === m.label),
  );

  const send = (action: string, form?: FormData) => {
    const data = form ?? new FormData();
    data.set('action', action);
    setMessage(null);
    start(async () => {
      const result = await updateWorkItem(
        {
          projectId,
          stageId: item.stageId,
          index: item.index,
          title: item.title,
        },
        data,
      );
      setMessage({ ok: result.saved, text: result.message });
      if (result.saved) {
        setPanel('');
        router.refresh();
      }
    });
  };
  const submitForm =
    (action: string) => (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const labels = form.getAll('m_label').map(String),
        values = form.getAll('m_value').map(String),
        units = form.getAll('m_unit').map(String);
      form.set(
        'measurements',
        JSON.stringify(
          labels.map((label, i) => ({
            label,
            value: values[i] ?? '',
            unit: units[i] ?? 'mm',
          })),
        ),
      );
      send(action, form);
    };

  const measureFields = (
    <div className="pf-measure-grid">
      {[...rows, ...extra].map((row) => (
        <label key={row.label} className="pf-measure">
          <span>{row.label}</span>
          <span className="pf-measure-input">
            <input
              name="m_value"
              inputMode="decimal"
              defaultValue={row.value}
              placeholder="—"
              aria-label={row.label + ' in ' + row.unit}
            />
            <em>{row.unit}</em>
          </span>
          <input type="hidden" name="m_label" value={row.label} />
          <input type="hidden" name="m_unit" value={row.unit} />
        </label>
      ))}
    </div>
  );

  return (
    <article
      className={'pf-work pf-work-' + item.status}
      id={'work-' + item.key.replace(':', '-')}
    >
      <header className="pf-work-head">
        <span className={'pf-dot pf-dot-' + item.status} aria-hidden="true">
          {item.status === 'completed'
            ? '✓'
            : item.status === 'skipped'
              ? '–'
              : ''}
        </span>
        <div className="pf-work-title">
          <strong>
            {item.title}
            {item.optional && <span className="pf-tag">Optional</span>}
          </strong>
          <small>
            {item.stageLabel}
            {item.planned ? ' · ' + item.planned : ''}
            {item.assigneeLabel ? ' · ' + item.assigneeLabel : ''}
            {item.crew ? ' · ' + item.crew : ''}
          </small>
        </div>
        <span className={'pf-pill pf-pill-' + item.status}>
          {statusText[item.status] ?? item.status}
        </span>
      </header>

      {item.measurements.length > 0 && (
        <ul className="pf-chips" aria-label="Recorded measurements">
          {item.measurements.map((m) => (
            <li key={m.label}>
              {m.label}{' '}
              <b>
                {m.value} {m.unit}
              </b>
            </li>
          ))}
        </ul>
      )}
      {item.status === 'skipped' && item.skipReason && (
        <p className="pf-note">Reason: {item.skipReason}</p>
      )}
      {!stageActive && !done && item.stageStatus === 'not_started' && (
        <p className="pf-wait">
          {item.blockers.length
            ? 'Waiting: ' + item.blockers[0]
            : 'Starts when its stage is started'}
        </p>
      )}
      {item.stageStatus === 'ready_for_qc' && !done && (
        <p className="pf-wait">Stage submitted for QC</p>
      )}

      <div className="pf-actions">
        {canWork && stageActive && item.status === 'pending' && (
          <button
            type="button"
            className="pf-btn pf-btn-primary"
            disabled={pending}
            onClick={() => send('start')}
          >
            ▶ Start work
          </button>
        )}
        {canWork && stageActive && item.status === 'in_progress' && (
          <>
            <button
              type="button"
              className="pf-btn pf-btn-primary"
              disabled={pending}
              onClick={() => setPanel(panel === 'complete' ? '' : 'complete')}
            >
              ✓ Complete with photo
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                className="pf-btn"
                disabled={pending}
                onClick={() => setPanel(panel === 'measure' ? '' : 'measure')}
              >
                Measurements
              </button>
            )}
            <button
              type="button"
              className="pf-btn"
              disabled={pending}
              onClick={() => send('pause')}
            >
              Pause
            </button>
          </>
        )}
        {canWork && stageActive && item.status === 'on_hold' && (
          <button
            type="button"
            className="pf-btn pf-btn-primary"
            disabled={pending}
            onClick={() => send('resume')}
          >
            ▶ Resume
          </button>
        )}
        {canRequest && stageActive && !done && (
          <button
            type="button"
            className="pf-btn"
            disabled={pending}
            onClick={() => setPanel(panel === 'material' ? '' : 'material')}
          >
            Request material
            {item.openMaterials ? ' · ' + item.openMaterials + ' open' : ''}
          </button>
        )}
        {canOwn && (
          <button
            type="button"
            className="pf-btn pf-btn-ghost"
            disabled={pending}
            onClick={() => setPanel(panel === 'owner' ? '' : 'owner')}
          >
            Manage
          </button>
        )}
      </div>

      {panel === 'complete' && (
        <form className="pf-panel" onSubmit={submitForm('complete')}>
          <h4>Finish this work</h4>
          {(rows.length > 0 || extra.length > 0) && (
            <>
              <p className="pf-help">Measured on site</p>
              {measureFields}
            </>
          )}
          <label className="pf-photo">
            <span>
              {item.hasPhoto
                ? 'New photo (optional — a photo is already attached)'
                : 'Site photo (required)'}
            </span>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              required={!item.hasPhoto}
            />
          </label>
          <label className="pf-field">
            <span>Note</span>
            <input name="note" maxLength={2000} placeholder="Optional" />
          </label>
          <button className="pf-btn pf-btn-primary pf-wide" disabled={pending}>
            {pending ? 'Saving…' : 'Mark complete'}
          </button>
        </form>
      )}

      {panel === 'measure' && (
        <form className="pf-panel" onSubmit={submitForm('measure')}>
          <h4>Measurements and checks</h4>
          {measureFields}
          <button className="pf-btn pf-btn-primary pf-wide" disabled={pending}>
            {pending ? 'Saving…' : 'Save measurements'}
          </button>
        </form>
      )}

      {panel === 'material' && (
        <div className="pf-panel">
          <MaterialRequestSheet
            projectId={projectId}
            stageId={item.stageId}
            index={item.index}
            workTitle={item.title}
            boq={boq}
            tomorrow={tomorrow}
            onDone={() => {
              setPanel('');
              router.refresh();
            }}
          />
        </div>
      )}

      {panel === 'owner' && (
        <div className="pf-panel pf-owner">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send('assign', new FormData(event.currentTarget));
            }}
          >
            <h4>Assign</h4>
            <div className="pf-row">
              <select
                name="user_id"
                defaultValue={item.assigneeId ?? ''}
                aria-label="Engineer"
              >
                <option value="">Unassigned</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              <input
                name="crew"
                defaultValue={item.crew}
                placeholder="Crew / gang (optional)"
                maxLength={120}
              />
              <button className="pf-btn" disabled={pending}>
                Save
              </button>
            </div>
          </form>
          {!done && item.status !== 'in_progress' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send('skip', new FormData(event.currentTarget));
              }}
            >
              <h4>Mark not applicable</h4>
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                placeholder="Why does this task not apply?"
              />
              {!item.optional && (
                <input
                  name="change_order_id"
                  placeholder="Approved change order ID (required for contracted work)"
                />
              )}
              <p className="pf-help">
                {item.optional
                  ? 'Optional tasks can be skipped with a reason.'
                  : 'Contracted work needs an approved change order. QC checks and structural certification are never skipped.'}
              </p>
              <button className="pf-btn pf-btn-danger" disabled={pending}>
                Skip with reason
              </button>
            </form>
          )}
          {(done || item.status === 'on_hold') &&
            item.stageStatus === 'in_progress' && (
              <button
                type="button"
                className="pf-btn"
                disabled={pending}
                onClick={() => send('reopen')}
              >
                Reopen task
              </button>
            )}
          {stageActive && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send('add_optional', new FormData(event.currentTarget));
              }}
            >
              <h4>Add optional task to this stage</h4>
              <input
                name="title"
                required
                minLength={3}
                maxLength={200}
                placeholder="Task, e.g. Scaffolding inspection"
              />
              <input
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                placeholder="Reason (10+ characters)"
              />
              <button className="pf-btn" disabled={pending}>
                Add task
              </button>
            </form>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={'pf-msg ' + (message.ok ? 'ok' : 'bad')}>
          {message.text}
        </p>
      )}
    </article>
  );
}
