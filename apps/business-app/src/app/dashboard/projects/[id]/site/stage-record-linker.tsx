'use client';

import { useState, useTransition } from 'react';
import { linkConstructionStageRecord } from './stage-record-actions';

export type StageLinkOption = {
  kind: 'report' | 'material' | 'media' | 'check' | 'curing_round' | 'payment';
  id: string;
  label: string;
  contractId?: string;
};

/** A project manager attaches an EXISTING canonical record to one stage. */
export function StageRecordLinker({
  projectId,
  stageId,
  options,
}: {
  projectId: string;
  stageId: string;
  options: StageLinkOption[];
}) {
  const [selected, setSelected] = useState('');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const groups = [
    ['report', 'Daily reports'],
    ['material', 'Material requirements'],
    ['media', 'Site and curing photos'],
    ['check', 'Informal site checks'],
    ['curing_round', 'Curing rounds'],
    ['payment', 'Activated payment milestones'],
  ] as const;
  const decode = (item: StageLinkOption) =>
    [item.kind, item.id, item.contractId ?? ''].join('|');

  return (
    <details className="cj-linker">
      <summary>Assign an existing record to this stage</summary>
      {options.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const option = options.find((item) => decode(item) === selected);
            if (!option || pending) return;
            start(async () => {
              const result = await linkConstructionStageRecord(
                projectId,
                stageId,
                option.kind,
                option.id,
                option.contractId,
              );
              setMessage(result.message);
              if (result.saved) setSelected('');
            });
          }}
        >
          <label htmlFor={'stage-association-' + stageId}>
            Existing site or financial record
          </label>
          <select
            id={'stage-association-' + stageId}
            required
            value={selected}
            onChange={(event) => setSelected(event.currentTarget.value)}
          >
            <option value="">Choose a record</option>
            {groups.map(([kind, label]) => {
              const records = options.filter((option) => option.kind === kind);
              return records.length ? (
                <optgroup key={kind} label={label}>
                  {records.map((option) => (
                    <option value={decode(option)} key={decode(option)}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <p>
            This creates a dated, auditable stage association. It never creates
            a purchase order, declares work complete, issues a payment request,
            or overwrites the source record.
          </p>
          <button type="submit" disabled={!selected || pending}>
            {pending ? 'Associating…' : 'Associate record'}
          </button>
        </form>
      ) : (
        <p>No accessible project records or active payment milestones are available yet.</p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
