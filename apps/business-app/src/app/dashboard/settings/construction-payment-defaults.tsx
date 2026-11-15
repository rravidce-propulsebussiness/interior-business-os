'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  companyWorkAreaLabel,
  inferCompanyWorkAreaCode,
  type CompanyConstructionPaymentRow,
  type CompanyWorkStep,
} from '@business-os/core/company-construction-defaults';
import { customerPaymentMilestoneName } from '@business-os/core/quotation-payment-plan';
import { saveConstructionPaymentDefaults } from './payment-default-actions';

type Kind = CompanyWorkStep['kind'];
const labels: Record<Kind, string> = {
  payment: 'Payment',
  work: 'Work',
  material: 'Material',
  check: 'Site check',
  test: 'Test',
  qc: 'Company QC',
};
const descriptions: Record<Kind, string> = {
  payment: 'Payments',
  work: 'Work',
  material: 'Materials',
  check: 'Checks',
  test: 'Tests',
  qc: 'QC',
};
const kinds: Kind[] = ['payment', 'work', 'material', 'check', 'test', 'qc'];
const isCheck = (step: CompanyWorkStep) =>
  step.kind === 'check' || step.kind === 'test';
const link = (step: CompanyWorkStep) =>
  step.area + '|' + step.name.toLowerCase();
const validQcOrder = (steps: CompanyWorkStep[]) =>
  !steps.some(
    (item, index) =>
      item.kind === 'qc' &&
      !steps
        .slice(0, index)
        .some((earlier) => isCheck(earlier) && link(earlier) === link(item)),
  );

function OrderNumberField({
  index,
  total,
  label,
  onCommit,
}: {
  index: number;
  total: number;
  label: string;
  onCommit: (position: number) => void;
}) {
  const [value, setValue] = useState(String(index + 1));
  useEffect(() => setValue(String(index + 1)), [index]);
  const commit = () => {
    const position = Number(value) - 1;
    if (Number.isInteger(position) && position >= 0 && position < total)
      onCommit(position);
    setValue(String(index + 1));
  };
  return (
    <input
      className="us-order-number"
      type="number"
      inputMode="numeric"
      min="1"
      max={total}
      step="1"
      value={value}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ItemIcon({ kind }: { kind: Kind }) {
  const shape =
    kind === 'payment' ? (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ) : kind === 'work' ? (
      <>
        <path d="M4 17h16M5 15a7 7 0 0 1 14 0M9 15V8M15 15V8M3 17v3h18v-3" />
      </>
    ) : kind === 'material' ? (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />
      </>
    ) : kind === 'check' ? (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5V3h6v2m-7 9 2 2 5-5" />
      </>
    ) : kind === 'test' ? (
      <>
        <path d="M9 3h6m-5 0v7L5 19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l-5-9V3M8 16h8" />
      </>
    ) : (
      <>
        <path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    );
  return (
    <svg
      className="us-payment-kind-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}
function ActionIcon({ action }: { action: 'edit' | 'delete' }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {action === 'edit' ? (
        <>
          <path d="m14 5 5 5M4 20l4.5-1 11-11a2 2 0 0 0-5-5l-11 11L4 20Z" />
        </>
      ) : (
        <>
          <path d="M4 7h16M10 4h4m-8 3 1 14h10l1-14M10 11v6m4-6v6" />
        </>
      )}
    </svg>
  );
}

function DefaultPaymentStage({
  row,
  index,
  allRows,
  canEdit,
  expanded,
  onToggle,
  onChange,
  onRemove,
  totalRows,
  onMove,
  onRouteStep,
}: {
  row: CompanyConstructionPaymentRow;
  index: number;
  allRows: CompanyConstructionPaymentRow[];
  canEdit: boolean;
  expanded: boolean;
  totalRows: number;
  onToggle: () => void;
  onChange: (next: CompanyConstructionPaymentRow) => void;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
  onRouteStep: (targetIndex: number, step: CompanyWorkStep) => void;
}) {
  const steps = row.steps ?? [];
  const areas = row.areas?.length
    ? row.areas
    : [...new Set(steps.map((item) => item.area))];
  const [kind, setKind] = useState<Kind>('work');
  const [name, setName] = useState('');
  const [checkRef, setCheckRef] = useState('');
  const [error, setError] = useState('');
  const [after, setAfter] = useState<number | null>(null);
  const [sequence, setSequence] = useState('1');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editingGuide, setEditingGuide] = useState<number | null>(null);
  const [guideTextDraft, setGuideTextDraft] = useState('');
  const [guideVideoDraft, setGuideVideoDraft] = useState('');
  const [routeStep, setRouteStep] = useState<CompanyWorkStep | null>(null);
  const [routeTargets, setRouteTargets] = useState<number[]>([]);
  const prior = steps
    .slice(0, after === null ? steps.length : after + 1)
    .filter(isCheck);
  const current = checkRef
    ? prior.find((x) => link(x) === checkRef)
    : prior.at(-1);
  const counts = kinds.map((type) => ({
    type,
    count: steps.filter((item) => item.kind === type).length,
  }));
  const limit = 6;
  const visible = showAll ? steps : steps.slice(0, limit);

  // Preserve the internal project stage mapping, without asking users to
  // repeatedly select PRECONSTRUCTION / DESIGN / FOUNDATION for every work item.
  const workAreaFor = (title: string, position: number): string | null => {
    const inferred = inferCompanyWorkAreaCode(title);
    if (inferred && areas.includes(inferred)) return inferred;
    return (
      steps[position]?.area ??
      steps[position + 1]?.area ??
      areas[0] ??
      inferred ??
      inferCompanyWorkAreaCode(row.name)
    );
  };
  const editRows = (next: CompanyWorkStep[]) => {
    onChange({ ...row, steps: next });
    setError('');
  };
  const add = (position: number) => {
    setAfter(position);
    setSequence(String(position + 2));
    setName('');
    setKind('work');
    setCheckRef('');
    setRouteStep(null);
    setRouteTargets([]);
    setError('');
  };
  const save = () => {
    const title =
      kind === 'qc'
        ? current?.name
        : kind === 'payment'
          ? row.name
          : name.trim().replace(/\s+/g, ' ');
    if (!title || title.length < 2 || title.length > 180) {
      setError(
        kind === 'payment'
          ? 'Select one construction stage for this payment.'
          : 'Enter an item name; for QC choose the earlier site check.',
      );
      return;
    }
    if ((kind === 'check' || kind === 'test') && title.length < 3) {
      setError('Enter a descriptive site check or test name.');
      return;
    }
    if (kind === 'qc' && !current) {
      setError(
        'First add a site check or test, then select it for company QC.',
      );
      return;
    }
    const insertAt = Number(sequence) - 1;
    if (
      !Number.isInteger(insertAt) ||
      insertAt < 0 ||
      insertAt > steps.length
    ) {
      setError('Enter a sequence number from 1 to ' + (steps.length + 1) + '.');
      return;
    }
    const chosenArea =
      kind === 'qc' ? current!.area : workAreaFor(title, insertAt - 1);
    if (!chosenArea) {
      const inferred = kind === 'qc' ? null : inferCompanyWorkAreaCode(title);
      const targets = inferred
        ? allRows.flatMap((candidate, candidateIndex) => {
            if (candidateIndex === index) return [];
            const candidateAreas = candidate.areas?.length
              ? candidate.areas
              : [...new Set((candidate.steps ?? []).map((item) => item.area))];
            return candidateAreas.includes(inferred) ? [candidateIndex] : [];
          })
        : [];
      if (inferred && targets.length) {
        setRouteStep({ kind, name: title, area: inferred });
        setRouteTargets(targets);
        setError(
          '“' +
            title +
            '” maps to ' +
            companyWorkAreaLabel(row, inferred) +
            '. Add it to a matching payment milestone:',
        );
        return;
      }
      setError(
        inferred
          ? 'This item maps to another construction stage. Add or update a payment milestone for that stage first.'
          : 'Add a construction stage to this payment milestone first.',
      );
      return;
    }
    if (areas.length && !areas.includes(chosenArea)) {
      setError('Choose a construction stage linked to this payment milestone.');
      return;
    }
    const nextItems: CompanyWorkStep[] = [
      { kind, name: title, area: chosenArea },
    ];
    const duplicate = nextItems.some((next) =>
      steps.some(
        (item) =>
          item.area === next.area &&
          item.name.toLowerCase() === next.name.toLowerCase() &&
          (item.kind === next.kind || (isCheck(item) && isCheck(next))),
      ),
    );
    if (duplicate) {
      setError('This item is already included in this construction stage.');
      return;
    }
    const updated = [...steps];
    updated.splice(insertAt, 0, ...nextItems);
    if (!validQcOrder(updated)) {
      setError('Company QC must remain after its linked site check/test.');
      return;
    }
    onChange({
      ...row,
      steps: updated,
      areas: [...new Set([...areas, chosenArea])],
    });
    if (updated.length > limit) setShowAll(true);
    setError('');
    setRouteStep(null);
    setRouteTargets([]);
    setAfter(null);
    setSequence('1');
    setName('');
    setCheckRef('');
  };
  const startEdit = (position: number) => {
    setEditing(position);
    setEditDraft(steps[position]?.name ?? '');
    setError('');
  };
  const startGuideEdit = (position: number) => {
    const item = steps[position];
    if (!item) return;
    setEditingGuide(position);
    setGuideTextDraft(item.guideText ?? '');
    setGuideVideoDraft(item.guideVideoUrl ?? '');
    setError('');
  };
  const saveGuide = () => {
    if (editingGuide === null) return;
    const text = guideTextDraft.trim(),
      video = guideVideoDraft.trim();
    if (text.length > 1800) {
      setError('Keep the guide under 1,800 characters.');
      return;
    }
    if (video) {
      try {
        if (new URL(video).protocol !== 'https:')
          throw new Error('https required');
      } catch {
        setError('Enter a valid secure https video link.');
        return;
      }
    }
    editRows(
      steps.map((item, position) =>
        position === editingGuide
          ? { ...item, guideText: text, guideVideoUrl: video }
          : item,
      ),
    );
    setEditingGuide(null);
    setError('');
  };
  const saveEdit = () => {
    if (editing === null) return;
    const item = steps[editing];
    if (!item || item.kind === 'qc' || item.kind === 'payment') return;
    const name = editDraft.trim().replace(/\s+/g, ' ');
    if (name.length < (isCheck(item) ? 3 : 2) || name.length > 180) {
      setError('Enter a descriptive item name, up to 180 characters.');
      return;
    }
    if (
      steps.some(
        (other, i) =>
          i !== editing &&
          other.area === item.area &&
          other.name.toLowerCase() === name.toLowerCase() &&
          (other.kind === item.kind || (isCheck(item) && isCheck(other))),
      )
    ) {
      setError('An item with this name is already included.');
      return;
    }
    const updated = steps.map((other, i) => {
      if (i === editing) return { ...other, name };
      if (
        isCheck(item) &&
        other.kind === 'qc' &&
        other.area === item.area &&
        other.name === item.name
      )
        return { ...other, name };
      return other;
    });
    editRows(updated);
    setEditing(null);
    setEditDraft('');
  };
  const removeStep = (position: number) => {
    const item = steps[position];
    if (!item) return;
    // Deletion stays a local template edit until the company form is saved.
    const updated = steps.filter(
      (other, i) =>
        i !== position &&
        !(isCheck(item) && other.kind === 'qc' && link(other) === link(item)),
    );
    editRows(updated);
    setEditing(null);
  };
  const moveStep = (from: number, to: number) => {
    if (
      from < 0 ||
      from >= steps.length ||
      to < 0 ||
      to >= steps.length ||
      from === to
    )
      return;
    const updated = [...steps];
    const [item] = updated.splice(from, 1);
    if (!item) return;
    updated.splice(to, 0, item);
    if (!validQcOrder(updated)) {
      setError('Company QC must remain after its linked site check/test.');
      return;
    }
    editRows(updated);
    setEditing(null);
  };
  return (
    <li
      className={'us-payment-stage' + (expanded ? ' is-expanded' : '')}
      draggable={canEdit}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'stage:' + index);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const value = event.dataTransfer.getData('text/plain');
        if (value.startsWith('stage:')) onMove(Number(value.slice(6)), index);
      }}
    >
      <button
        className="us-payment-stage-toggle"
        type="button"
        onClick={() => {
          if (expanded) {
            setShowAll(false);
            setEditing(null);
            setAfter(null);
            setRouteStep(null);
            setRouteTargets([]);
          }
          onToggle();
        }}
        aria-expanded={expanded}
        aria-controls={'company-payment-stage-' + index}
      >
        {canEdit && (
          <span className="us-payment-stage-drag" aria-hidden="true">
            ⠿
          </span>
        )}
        <span className="us-payment-default-index">{index + 1}</span>
        <span className="us-payment-heading-copy">
          <strong>{row.name || 'Untitled payment milestone'}</strong>
          <small>
            {steps.length} included items · editable company template
          </small>
        </span>
        <span className="us-payment-heading-percent">
          <b>
            {Number(row.percent || 0).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            %
          </b>
          <small>of total value</small>
        </span>
        <span
          className={'us-payment-chevron' + (expanded ? ' is-up' : '')}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>
      <div
        className="us-payment-stage-stats"
        aria-label={'Included item counts for stage ' + (index + 1)}
      >
        {counts.map(({ type, count }) => (
          <span className={'us-payment-stat is-' + type} key={type}>
            <ItemIcon kind={type} />
            <strong>{count}</strong>
            <small>{descriptions[type]}</small>
          </span>
        ))}
      </div>
      {expanded && (
        <div
          id={'company-payment-stage-' + index}
          className="us-payment-stage-content"
        >
          <div className="us-payment-stage-fields">
            <label>
              Milestone name
              <input
                value={row.name}
                maxLength={100}
                required
                disabled={!canEdit}
                aria-label={'Default milestone ' + (index + 1)}
                onChange={(e) =>
                  onChange({
                    ...row,
                    name: e.target.value,
                    steps: steps.map((step) =>
                      step.kind === 'payment'
                        ? { ...step, name: e.target.value }
                        : step,
                    ),
                  })
                }
              />
            </label>
            <label>
              Percentage
              <span className="us-payment-default-percent">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={row.percent || ''}
                  required
                  disabled={!canEdit}
                  aria-label={'Default percentage ' + (index + 1)}
                  onChange={(e) =>
                    onChange({ ...row, percent: Number(e.target.value) })
                  }
                />{' '}
                %
              </span>
            </label>
            {canEdit && (
              <div className="us-payment-stage-order">
                <label>
                  Stage number
                  <OrderNumberField
                    index={index}
                    total={totalRows}
                    label="Stage number"
                    onCommit={(position) => onMove(index, position)}
                  />
                </label>
                <button
                  type="button"
                  className="us-payment-remove"
                  onClick={onRemove}
                >
                  Remove stage
                </button>
              </div>
            )}
          </div>
          <p className="us-payment-note">
            Drag items using the grip or enter a sequence number. Company QC
            must stay after its linked site check/test.
          </p>
          <div className="us-payment-items-heading">
            <strong>Items in this stage</strong>
            {steps.length > limit && (
              <button
                className="us-payment-step-expand"
                type="button"
                aria-expanded={showAll}
                aria-controls={'company-payment-items-' + index}
                onClick={() => {
                  setShowAll((value) => !value);
                  setEditing(null);
                  setAfter(null);
                }}
              >
                {showAll
                  ? 'Show fewer items'
                  : 'Show all ' + steps.length + ' items'}
                <span aria-hidden="true">{showAll ? '⌃' : '⌄'}</span>
              </button>
            )}
          </div>
          <div
            id={'company-payment-items-' + index}
            className="us-payment-step-list"
          >
            {visible.map((item, position) => (
              <div
                key={item.kind + '-' + item.area + '-' + item.name}
                className="us-payment-step"
                draggable={canEdit}
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', 'step:' + position);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const value = event.dataTransfer.getData('text/plain');
                  if (value.startsWith('step:'))
                    moveStep(Number(value.slice(5)), position);
                }}
              >
                {canEdit ? (
                  <OrderNumberField
                    index={position}
                    total={steps.length}
                    label={'Sequence number for ' + item.name}
                    onCommit={(target) => moveStep(position, target)}
                  />
                ) : (
                  <span className="us-payment-step-number">{position + 1}</span>
                )}
                <span className={'us-payment-step-kind is-' + item.kind}>
                  <ItemIcon kind={item.kind} />
                  <small>{labels[item.kind]}</small>
                </span>
                <div className="us-payment-step-name">
                  {editing === position ? (
                    <div className="us-payment-step-edit-form">
                      <input
                        autoFocus
                        value={editDraft}
                        maxLength={180}
                        aria-label={
                          'Edit ' + labels[item.kind] + ' ' + (position + 1)
                        }
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                      />
                      <button type="button" onClick={saveEdit}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span>
                      {item.kind === 'payment'
                        ? 'Payment due · ' +
                          customerPaymentMilestoneName(row.name, areas) +
                          ' · ' +
                          Number(row.percent || 0).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          }) +
                          '% of total'
                        : item.name}
                    </span>
                  )}
                  {canEdit &&
                    item.kind !== 'material' &&
                    item.kind !== 'payment' && (
                      <button
                        type="button"
                        className="us-payment-guide-action"
                        onClick={() => startGuideEdit(position)}
                      >
                        {item.guideText || item.guideVideoUrl
                          ? 'Edit guide'
                          : '＋ Add guide'}
                      </button>
                    )}
                </div>
                {canEdit && (
                  <div className="us-payment-step-actions">
                    <span className="us-payment-step-drag" aria-hidden="true">
                      ⠿
                    </span>
                    <button
                      type="button"
                      aria-label={'Edit step ' + (position + 1)}
                      title="Edit item"
                      disabled={item.kind === 'qc' || item.kind === 'payment'}
                      onClick={() => startEdit(position)}
                    >
                      <ActionIcon action="edit" />
                    </button>
                    <button
                      type="button"
                      aria-label={'Delete step ' + (position + 1)}
                      title="Delete item"
                      className="us-payment-step-delete"
                      onClick={() => removeStep(position)}
                    >
                      <ActionIcon action="delete" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!steps.length && (
              <p className="us-payment-empty">
                No steps yet. Add the first work item below.
              </p>
            )}
          </div>
          {editingGuide !== null && canEdit && (
            <section
              className="us-guide-editor"
              aria-label="Work and QC guidance"
            >
              <div>
                <strong>
                  {steps[editingGuide]?.kind === 'work'
                    ? 'Work instructions'
                    : steps[editingGuide]?.kind === 'material'
                      ? 'Material handling guidance'
                      : 'Inspection and QC guidance'}
                </strong>
                <p>
                  {steps[editingGuide]?.name} · copied into new quotations and
                  project timelines
                </p>
              </div>
              <label>
                {steps[editingGuide]?.kind === 'work'
                  ? 'How to do this work'
                  : 'How to check and accept this item'}
                <textarea
                  value={guideTextDraft}
                  maxLength={1800}
                  rows={5}
                  placeholder={
                    steps[editingGuide]?.kind === 'work'
                      ? 'Write clear site instructions in the order the engineer should follow.'
                      : 'Describe the inspection method, acceptance criteria and evidence to record.'
                  }
                  onChange={(event) => setGuideTextDraft(event.target.value)}
                />
                <small>{guideTextDraft.length}/1,800 characters</small>
              </label>
              <label>
                {steps[editingGuide]?.kind === 'work'
                  ? 'Work instruction video URL'
                  : 'Check / QC video URL'}
                <input
                  type="url"
                  value={guideVideoDraft}
                  maxLength={1000}
                  placeholder="https://…"
                  onChange={(event) => setGuideVideoDraft(event.target.value)}
                />
              </label>
              {guideVideoDraft.trim().startsWith('https://') && (
                <a
                  href={guideVideoDraft.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open current video ↗
                </a>
              )}
              <div className="us-guide-editor-actions">
                <button type="button" className="us-save" onClick={saveGuide}>
                  Save guide
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGuide(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          {canEdit && (
            <button
              type="button"
              className="us-payment-add-work"
              onClick={() => add(steps.length - 1)}
            >
              ＋ Add payment, work, material or check
            </button>
          )}
          {canEdit && after !== null && (
            <div className="us-payment-step-form">
              <label>
                Type of item
                <select
                  aria-label="New default step type"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as Kind);
                    setCheckRef('');
                  }}
                >
                  <option value="payment">Payment milestone</option>
                  <option value="work">Work</option>
                  <option value="material">Material required</option>
                  <option value="check">Site check</option>
                  <option value="test">Test</option>
                  <option value="qc">Company QC</option>
                </select>
              </label>
              <label>
                Sequence number
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={steps.length + 1}
                  step="1"
                  value={sequence}
                  aria-label="New item sequence number"
                  onChange={(event) => setSequence(event.target.value)}
                />
              </label>

              {kind === 'qc' ? (
                <label>
                  QC for which earlier site check/test?
                  <select
                    value={current ? link(current) : ''}
                    onChange={(e) => setCheckRef(e.target.value)}
                    aria-label="QC linked site check"
                  >
                    {prior.length === 0 && (
                      <option value="">Add site check first</option>
                    )}
                    {prior.map((item) => (
                      <option key={link(item)} value={link(item)}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : kind === 'payment' ? (
                <p className="us-payment-item-hint">
                  This links the existing{' '}
                  {Number(row.percent || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                  % {row.name} milestone. It does not create another payment or
                  invoice.
                </p>
              ) : (
                <label>
                  Item name
                  <input
                    autoFocus
                    value={name}
                    maxLength={180}
                    placeholder="e.g. Footing bar bending"
                    aria-label="New default work item name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <div className="us-payment-step-form-actions">
                <button
                  type="button"
                  className="us-payment-save-item"
                  onClick={save}
                >
                  Add {labels[kind]}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAfter(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="us-payment-error">
              <p>{error}</p>
              {routeStep && (
                <div className="us-payment-route-actions">
                  {routeTargets.map((targetIndex) => {
                    const target = allRows[targetIndex];
                    if (!target) return null;
                    return (
                      <button
                        key={targetIndex}
                        type="button"
                        onClick={() => {
                          if (
                            (target.steps ?? []).some(
                              (item) =>
                                item.area === routeStep.area &&
                                item.name.toLowerCase() ===
                                  routeStep.name.toLowerCase() &&
                                (item.kind === routeStep.kind ||
                                  (isCheck(item) && isCheck(routeStep))),
                            )
                          ) {
                            setError(
                              'This item is already included in that payment milestone.',
                            );
                            setRouteStep(null);
                            return;
                          }
                          onRouteStep(targetIndex, routeStep);
                          setAfter(null);
                          setName('');
                          setCheckRef('');
                          setRouteStep(null);
                          setRouteTargets([]);
                          setError('');
                        }}
                      >
                        Add to {target.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function ConstructionPaymentDefaults({
  initial,
  canEdit,
}: {
  initial: CompanyConstructionPaymentRow[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<CompanyConstructionPaymentRow[]>(
    initial.map((item) => ({
      ...item,
      areas: [...(item.areas ?? [])],
      steps: [...(item.steps ?? [])],
    })),
  );
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [state, action, pending] = useActionState(
    saveConstructionPaymentDefaults,
    { saved: false, message: '' },
  );
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const update = (index: number, next: CompanyConstructionPaymentRow) => {
    setRows((previous) => previous.map((row, i) => (i === index ? next : row)));
  };
  const remove = (index: number) => {
    setRows((previous) => previous.filter((_, i) => i !== index));
    setExpandedIndex((value) =>
      value === null
        ? null
        : value === index
          ? null
          : value > index
            ? value - 1
            : value,
    );
  };
  const moveStage = (from: number, to: number) => {
    if (
      from < 0 ||
      from >= rows.length ||
      to < 0 ||
      to >= rows.length ||
      from === to
    )
      return;
    setRows((previous) => {
      const next = [...previous];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
    setExpandedIndex((value) =>
      value === from
        ? to
        : value === null
          ? null
          : from < to && value > from && value <= to
            ? value - 1
            : from > to && value >= to && value < from
              ? value + 1
              : value,
    );
  };
  return (
    <div className="us-payment-defaults">
      <p className="us-info">
        Configure payment stages, work, materials, site checks and company QC
        once. Add text and video guides to each work or QC item; saved defaults
        populate new quotations and their project timelines.
      </p>
      <form action={action}>
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />
        <ol className="us-payment-default-list">
          {rows.map((row, index) => (
            <DefaultPaymentStage
              key={row.name + '-' + index}
              row={row}
              index={index}
              allRows={rows}
              expanded={expandedIndex === index}
              onToggle={() =>
                setExpandedIndex((value) => (value === index ? null : index))
              }
              canEdit={canEdit}
              totalRows={rows.length}
              onMove={moveStage}
              onChange={(next) => update(index, next)}
              onRemove={() => remove(index)}
              onRouteStep={(targetIndex, step) => {
                setRows((previous) =>
                  previous.map((candidate, i) =>
                    i === targetIndex
                      ? {
                          ...candidate,
                          areas: [
                            ...new Set([
                              ...(candidate.areas?.length
                                ? candidate.areas
                                : (candidate.steps ?? []).map(
                                    (item) => item.area,
                                  )),
                              step.area,
                            ]),
                          ],
                          steps: [...(candidate.steps ?? []), step],
                        }
                      : candidate,
                  ),
                );
                setExpandedIndex(targetIndex);
              }}
            />
          ))}
        </ol>
        {canEdit && (
          <button
            type="button"
            className="us-payment-add"
            disabled={rows.length >= 40}
            onClick={() => {
              setRows((previous) => [
                ...previous,
                {
                  name: 'New construction milestone',
                  percent: 0,
                  areas: [],
                  steps: [],
                },
              ]);
              setExpandedIndex(rows.length);
            }}
          >
            ＋ Add payment stage
          </button>
        )}
        <div className="us-payment-default-footer">
          <strong>Total: {total.toFixed(2)}%</strong>
          {canEdit && (
            <button
              type="submit"
              className="us-save"
              disabled={
                pending ||
                Math.abs(total - 100) > 0.001 ||
                !rows.length ||
                rows.some((row) => !row.name.trim() || row.percent <= 0)
              }
            >
              {pending ? 'Saving…' : 'Save company payments & work'}
            </button>
          )}
        </div>
        {state.message && (
          <p
            role="status"
            className={state.saved ? 'us-info' : 'us-payment-error'}
          >
            {state.message}
          </p>
        )}
      </form>
      <section
        className="us-workflow-preview"
        aria-labelledby="us-workflow-preview-title"
      >
        <div className="us-workflow-preview-heading">
          <div>
            <strong id="us-workflow-preview-title">
              How it appears in a quotation
            </strong>
            <p>
              New construction quotations use these saved payment milestones and
              work items automatically.
            </p>
          </div>
          <span>Read-only preview</span>
        </div>
        <div className="us-workflow-preview-list">
          {rows.map((row, index) => {
            const work = (row.steps ?? []).filter(
              (item) => item.kind === 'work',
            );
            const quality = (row.steps ?? []).filter((item) =>
              ['check', 'test', 'qc'].includes(item.kind),
            );
            return (
              <article className="us-workflow-preview-stage" key={index}>
                <div className="us-workflow-preview-stage-head">
                  <strong>{row.name || 'Untitled milestone'}</strong>
                  <span className="us-work-milestone-type">Work milestone</span>
                  <b>
                    {Number(row.percent || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </b>
                </div>
                {work.length ? (
                  <ol>
                    {work.map((item, workIndex) => (
                      <li key={workIndex}>{item.name}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="us-workflow-preview-empty">
                    No work items are linked yet.
                  </p>
                )}
                {!!quality.length && (
                  <small>
                    {quality.filter((item) => item.kind !== 'qc').length}{' '}
                    checks/tests ·{' '}
                    {quality.filter((item) => item.kind === 'qc').length}{' '}
                    company QC checkpoints
                  </small>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
