'use client';

import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import {
  type CompanyConstructionStage,
  type CompanyStageItem,
  companyConstructionStages,
  defaultCompanyConstructionStages,
  defaultInteriorStages,
} from '@business-os/core/company-construction-defaults';
import { saveConstructionPaymentDefaults } from './payment-default-actions';
import {
  scheduledStageItemDays,
  stageWithUpdatedItems,
} from './workflow-stage-days';
import {
  type AutosaveStatus,
  createWorkflowAutosave,
} from './workflow-autosave';

const move = <T,>(values: T[], from: number, to: number) => {
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
};

/** crypto.randomUUID only exists in secure contexts (https / localhost). */
const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/** Industry keys and stage ids must start with a letter (server regex). */
export const industryKeyFromName = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return '';
  return (/^[a-z]/.test(slug) ? slug : `industry-${slug}`)
    .slice(0, 60)
    .replace(/-$/, '');
};

const defaultStages = (industry: string): CompanyConstructionStage[] => {
  if (industry === 'construction')
    return structuredClone(defaultCompanyConstructionStages);
  if (industry === 'interior') return structuredClone(defaultInteriorStages);
  return ['Planning', 'Delivery', 'Quality review'].map((name, index) => ({
    id: `stage-${index + 1}`,
    name,
    description: '',
    repeatsPerFloor: false,
    days: index === 0 ? 5 : 10,
    items: [],
  }));
};

const itemKinds: CompanyStageItem['kind'][] = [
  'work',
  'design',
  'material',
  'check',
  'test',
  'qc',
  'payment',
];
const kindLabel = (kind: CompanyStageItem['kind']) =>
  kind === 'qc'
    ? 'QC'
    : kind === 'check'
      ? 'Site check'
      : kind[0]!.toUpperCase() + kind.slice(1);

/** Readable copy for the schema errors people can actually cause here. */
const friendlyIssue = (path: PropertyKey[], fallback?: string) => {
  const field = path.at(-1);
  if (field === 'name') return 'Stage name needs at least 2 characters.';
  if (field === 'title')
    return 'Each work item needs a title of 2+ characters.';
  if (field === 'description')
    return 'Keep the description under 300 characters.';
  if (field === 'guideVideoUrl')
    return 'Guide video links must start with https://.';
  return fallback ?? 'Check the workflow entries.';
};

const icons = {
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  chevron: 'm6 9 6 6 6-6',
  check: 'm5 12 5 5 9-10',
  general:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  payments: 'M3 6h18v13H3zM3 10h18M7 15h4',
  resources:
    'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 6-3 8-3 9h18c0-1-3-3-3-9ZM10 21h4',
  timeline:
    'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 9v3a3 3 0 0 0 3 3h6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  guide:
    'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11M8 8h6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
} as const;

function Icon({
  name,
  size = 16,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name]} />
    </svg>
  );
}

function Grip(props: {
  label: string;
  canEdit: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onMove: (offset: -1 | 1) => void;
}) {
  return (
    <span
      className="wf-grip"
      role="button"
      tabIndex={props.canEdit ? 0 : -1}
      aria-label={props.label}
      aria-disabled={!props.canEdit}
      draggable={props.canEdit}
      onDragStart={props.onDragStart}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!props.canEdit) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          props.onMove(event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
        {[2, 8, 14].flatMap((y) =>
          [3, 9].map((x) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="1.5"
              fill="currentColor"
            />
          )),
        )}
      </svg>
    </span>
  );
}

function ItemKindPicker({
  value,
  disabled,
  onChange,
  label,
}: {
  value: CompanyStageItem['kind'];
  disabled?: boolean;
  onChange: (value: CompanyStageItem['kind']) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="wf-kind-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className={`wf-kind-trigger is-${value}`}
        aria-label={`${label}: ${kindLabel(value)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
      >
        {kindLabel(value)}
      </button>
      {open && (
        <div className="wf-kind-menu" role="listbox" aria-label={label}>
          {itemKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="option"
              aria-selected={value === kind}
              onClick={() => {
                onChange(kind);
                setOpen(false);
              }}
            >
              <span>{kindLabel(kind)}</span>
              {value === kind && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sequential working-day plan; per-floor stages repeat for every floor. */
export function workflowTimeline(
  stages: CompanyConstructionStage[],
  floors: number,
) {
  let start = 0;
  const rows = stages.map((stage) => {
    const workDays = scheduledStageItemDays(stage.items);
    const once = Math.max(stage.days, workDays);
    const span = stage.repeatsPerFloor ? once * Math.max(1, floors) : once;
    const row = { id: stage.id, name: stage.name, start, span, once };
    start += span;
    return row;
  });
  return { rows, total: start };
}

function TimelinePreview({
  stages,
  onClose,
}: {
  stages: CompanyConstructionStage[];
  onClose: () => void;
}) {
  const [floors, setFloors] = useState(2);
  const { rows, total } = workflowTimeline(stages, floors);
  return (
    <section className="wf-timeline" aria-label="Timeline preview">
      <header>
        <div>
          <h3>Timeline preview</h3>
          <p>
            {total} working days for a {floors}-floor project · Sundays excluded
          </p>
        </div>
        <label className="wf-timeline-floors">
          Floors
          <input
            type="number"
            min="1"
            max="50"
            value={floors}
            onChange={(event) =>
              setFloors(
                Math.min(50, Math.max(1, Number(event.target.value) || 1)),
              )
            }
          />
        </label>
        <button
          type="button"
          className="wf-icon-button"
          aria-label="Close timeline preview"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <span className="wf-timeline-name">{row.name}</span>
            <span className="wf-timeline-track">
              <span
                className="wf-timeline-bar"
                style={
                  {
                    '--i': rows.indexOf(row),
                    marginLeft: total ? `${(row.start / total) * 100}%` : 0,
                    width: total
                      ? `${Math.max((row.span / total) * 100, 1)}%`
                      : 0,
                  } as CSSProperties
                }
              />
            </span>
            <span className="wf-timeline-days">
              Day {row.start + 1}–{row.start + row.span}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="wf-field">
      <span className="wf-field-label">{label}</span>
      {children}
    </label>
  );
}

export function ConstructionPaymentDefaults({
  canEdit,
  initial,
  industries,
}: {
  canEdit: boolean;
  initial: Record<string, CompanyConstructionStage[]>;
  industries: { key: string; name: string }[];
}) {
  const [industryKey, setIndustryKey] = useState(
    industries[0]?.key ?? 'construction',
  );
  const [knownIndustries, setKnownIndustries] = useState(industries);
  const [workflows, setWorkflows] =
    useState<Record<string, CompanyConstructionStage[]>>(initial);
  const [saveStatuses, setSaveStatuses] = useState<
    Record<string, AutosaveStatus>
  >({});
  const [newIndustryName, setNewIndustryName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftKinds, setDraftKinds] = useState<
    Record<string, CompanyStageItem['kind']>
  >({});
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [clientError, setClientError] = useState('');

  // Each industry has its own draft and serial save queue. A slow response
  // cannot reset newer edits or a different industry's visible stage list.
  const [autosave] = useState(() =>
    createWorkflowAutosave<CompanyConstructionStage[]>({
      initial,
      validate: (rows) => {
        const parsed = companyConstructionStages.safeParse(rows);
        if (parsed.success) return null;
        const issue = parsed.error.issues[0];
        const index = typeof issue?.path[0] === 'number' ? issue.path[0] : -1;
        const stage = rows[index];
        return (
          (stage ? (stage.name || 'Stage ' + (index + 1)) + ': ' : '') +
          friendlyIssue(issue?.path ?? [], issue?.message)
        );
      },
      persist: async (industry, rows) => {
        const form = new FormData();
        form.set('industryKey', industry);
        form.set('rows', JSON.stringify(rows));
        const result = await saveConstructionPaymentDefaults(
          { saved: false, message: '' },
          form,
        );
        return {
          ok: result.saved,
          ...(result.savedRowsByIndustry?.[industry]
            ? { rows: result.savedRowsByIndustry[industry] }
            : {}),
          message: result.message,
        };
      },
      onStatus: (industry, status) =>
        setSaveStatuses((current) => ({ ...current, [industry]: status })),
      onCommitted: (industry, rows) =>
        setWorkflows((current) => ({ ...current, [industry]: rows })),
    }),
  );

  useEffect(() => {
    autosave.activate();
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosave.hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      autosave.dispose();
    };
  }, [autosave]);

  const stages = workflows[industryKey] ?? defaultStages(industryKey);
  const industryName =
    knownIndustries.find((item) => item.key === industryKey)?.name ??
    'Construction';
  const currentIndex = stages.findIndex((stage) => stage.id === expandedStage);
  const status = saveStatuses[industryKey];

  const mutateStages = (
    updater: (rows: CompanyConstructionStage[]) => CompanyConstructionStage[],
    immediate = false,
  ) => {
    const latest = autosave.getDraft(industryKey) ?? defaultStages(industryKey);
    const next = updater(latest);
    autosave.change(industryKey, next, immediate ? 0 : 700);
    setWorkflows((current) => ({ ...current, [industryKey]: next }));
    setClientError('');
  };
  const switchIndustry = (key: string) => {
    if (key === industryKey) return;
    // Flush the previous industry immediately; preserve its draft while the
    // request is in flight, instead of resetting it to an older saved value.
    void autosave.flush(industryKey);
    let next = autosave.getDraft(key);
    if (!next) {
      next = defaultStages(key);
      autosave.change(key, next, 0);
      setWorkflows((current) => ({ ...current, [key]: next! }));
    }
    setIndustryKey(key);
    setExpandedStage(next[0]?.id ?? null);
    setClientError('');
  };
  const patchStage = (
    index: number,
    patch: Partial<CompanyConstructionStage>,
    immediate = false,
  ) =>
    mutateStages(
      (current) =>
        current.map((stage, i) => {
          if (i !== index) return stage;
          if (patch.items) {
            const synced = stageWithUpdatedItems(stage, patch.items);
            return { ...stage, ...patch, days: synced.days };
          }
          return { ...stage, ...patch };
        }),
      immediate,
    );
  const patchItem = (
    stageIndex: number,
    itemIndex: number,
    patch: Partial<CompanyStageItem>,
  ) =>
    mutateStages((current) =>
      current.map((stage, i) => {
        if (i !== stageIndex) return stage;
        const items = stage.items.map((item, j) =>
          j === itemIndex ? { ...item, ...patch } : item,
        );
        return 'days' in patch || 'kind' in patch
          ? stageWithUpdatedItems(stage, items, true)
          : { ...stage, items };
      }),
    );
  const moveStage = (from: number, to: number) => {
    if (to < 0 || to >= stages.length || from === to) return;
    mutateStages((rows) => move(rows, from, to), true);
  };
  const moveItem = (stageIndex: number, from: number, to: number) => {
    const items = stages[stageIndex]?.items ?? [];
    if (to < 0 || to >= items.length || from === to) return;
    patchStage(stageIndex, { items: move(items, from, to) }, true);
  };
  const addItem = (index: number, stage: CompanyConstructionStage) => {
    const kind = draftKinds[stage.id] ?? 'work';
    const title = drafts[stage.id]?.trim();
    if (!title || title.length < 2) {
      setClientError('Enter an item title of at least two characters.');
      return;
    }
    mutateStages(
      (rows) =>
        rows.map((row, i) =>
          i === index
            ? stageWithUpdatedItems(row, [
                ...row.items,
                {
                  id: newId(),
                  kind,
                  title,
                  days: kind === 'payment' ? 0 : 1,
                },
              ])
            : row,
        ),
      true,
    );
    setDrafts((all) => ({ ...all, [stage.id]: '' }));
    // Add item persists straight away; debounce applies only to typing.
    void autosave.flush(industryKey);
  };
  const toggleStage = (id: string) =>
    setExpandedStage((current) => (current === id ? null : id));
  const statusMessage =
    clientError || (status?.phase === 'error' ? status.message : '');

  return (
    <div
      className="wf-editor us-company-stage-editor"
      aria-label="Project workflow settings"
    >
      <div className="wf-toolbar" aria-label="Workflow controls">
        <div
          className="wf-industries"
          role="tablist"
          aria-label="Industry workflow"
        >
          {knownIndustries.map((industry) => (
            <button
              key={industry.key}
              type="button"
              role="tab"
              aria-selected={industry.key === industryKey}
              className={industry.key === industryKey ? 'is-active' : ''}
              onClick={() => switchIndustry(industry.key)}
            >
              {industry.name}
            </button>
          ))}
          {canEdit && (
            <div className="wf-add-industry">
              <input
                aria-label="New industry"
                value={newIndustryName}
                maxLength={60}
                onChange={(event) => setNewIndustryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="Add industry"
              />
              <button
                type="button"
                aria-label="Add industry"
                onClick={() => {
                  const name = newIndustryName.trim();
                  const key = industryKeyFromName(name);
                  if (!name || !key) return;
                  if (!knownIndustries.some((item) => item.key === key))
                    setKnownIndustries((all) => [...all, { key, name }]);
                  setNewIndustryName('');
                  switchIndustry(key);
                }}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="wf-toolbar-actions">
          {status && (
            <span
              role="status"
              aria-live="polite"
              title={status.message}
              className={'wf-autosave-status is-' + status.phase}
            >
              <span className="wf-autosave-dot" aria-hidden="true" />
              {status.phase === 'saving'
                ? 'Saving…'
                : status.phase === 'saved'
                  ? 'Saved'
                  : status.phase === 'error'
                    ? 'Save failed'
                    : 'Unsaved'}
            </span>
          )}
          {(clientError || status?.phase === 'error') && canEdit && (
            <button
              type="button"
              className="wf-retry-save"
              onClick={() => {
                setClientError('');
                void autosave.flush(industryKey);
              }}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            className="wf-button wf-button-ghost wf-preview-button"
            aria-pressed={showTimeline}
            onClick={() => setShowTimeline((shown) => !shown)}
          >
            <Icon name="timeline" /> Preview Timeline
          </button>
        </div>
      </div>
      {statusMessage && (
        <p className="wf-status is-bad" role="alert">
          {statusMessage}
        </p>
      )}

      {showTimeline && (
        <TimelinePreview
          stages={stages}
          onClose={() => setShowTimeline(false)}
        />
      )}

      <section className="wf-card">
        <header className="wf-card-head">
          <span className="wf-card-icon">
            <Icon name="layers" size={26} />
          </span>
          <div className="wf-card-title">
            <h2>{industryName} Workflow</h2>
            <p>
              Set up your project stages, durations and the work sequence for
              each stage.
            </p>
          </div>
          {stages.length > 0 && (
            <div className="wf-stepper-scroll">
              <ol
                className="wf-stepper"
                aria-label="Workflow stages overview"
                style={
                  {
                    '--n': stages.length,
                    '--p':
                      stages.length > 1 && currentIndex > 0
                        ? currentIndex / (stages.length - 1)
                        : 0,
                  } as CSSProperties
                }
              >
                <li className="wf-stepper-track" aria-hidden="true">
                  <span />
                </li>
                {stages.map((stage, index) => {
                  const status =
                    index === currentIndex
                      ? 'is-current'
                      : currentIndex >= 0 && index < currentIndex
                        ? 'is-done'
                        : '';
                  return (
                    <li
                      key={stage.id}
                      className={'wf-step ' + status}
                      style={{ '--i': index } as CSSProperties}
                    >
                      <button
                        type="button"
                        aria-current={
                          index === currentIndex ? 'step' : undefined
                        }
                        onClick={() => setExpandedStage(stage.id)}
                      >
                        <span className="wf-step-dot">
                          {status === 'is-done' && (
                            <Icon name="check" size={11} />
                          )}
                        </span>
                        <span className="wf-step-label">
                          {stage.name || `Stage ${index + 1}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </header>

        <div className="wf-stages">
          {stages.map((stage, index) => {
            const expanded = expandedStage === stage.id;
            const itemDays = scheduledStageItemDays(stage.items);
            const bodyId = `wf-stage-body-${stage.id}`;
            return (
              <section
                key={stage.id}
                className={
                  'wf-stage us-company-stage-card' +
                  (expanded ? ' is-expanded' : '')
                }
                style={{ '--i': index } as CSSProperties}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const data = event.dataTransfer.getData('text/plain');
                  if (!data.startsWith('stage:')) return;
                  moveStage(Number(data.slice(6)), index);
                }}
              >
                <header
                  className="wf-stage-row"
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (
                      target.closest('button, input, textarea, [role="button"]')
                    )
                      return;
                    toggleStage(stage.id);
                  }}
                >
                  <Grip
                    label={`Reorder ${stage.name}. Use arrow keys to move.`}
                    canEdit={canEdit}
                    onMove={(offset) => moveStage(index, index + offset)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        'text/plain',
                        `stage:${index}`,
                      );
                      const card = event.currentTarget.closest('section');
                      if (card) event.dataTransfer.setDragImage(card, 24, 24);
                    }}
                  />
                  <span className="wf-stage-number">{index + 1}</span>
                  {expanded ? (
                    <input
                      className="wf-stage-name-input"
                      aria-label="Stage name"
                      value={stage.name}
                      maxLength={100}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patchStage(index, { name: event.target.value })
                      }
                    />
                  ) : (
                    <strong className="wf-stage-name">
                      {stage.name || 'Untitled stage'}
                    </strong>
                  )}
                  <span className="wf-stage-desc">
                    {stage.description || 'No description yet.'}
                  </span>
                  <span className="wf-stage-meta wf-stage-days">
                    <Icon name="calendar" />
                    {stage.days} working days
                  </span>
                  <span className="wf-stage-meta wf-stage-repeat">
                    <Icon name="layers" />
                    {stage.repeatsPerFloor ? 'Per floor' : 'One time'}
                  </span>
                  <span className="wf-stage-compact">
                    {stage.days} days ·{' '}
                    {stage.repeatsPerFloor ? 'Per floor' : 'One time'}
                  </span>
                  <button
                    type="button"
                    className="wf-icon-button wf-stage-toggle"
                    aria-expanded={expanded}
                    aria-controls={bodyId}
                    aria-label={
                      (expanded ? 'Collapse ' : 'Expand ') + stage.name
                    }
                    onClick={() => toggleStage(stage.id)}
                  >
                    <Icon name="chevron" size={18} />
                  </button>
                </header>

                {expanded && (
                  <div className="wf-stage-body" id={bodyId}>
                    <div className="wf-stage-fields">
                      <Field label="Stage description">
                        <input
                          value={stage.description ?? ''}
                          maxLength={300}
                          disabled={!canEdit}
                          placeholder="What happens in this stage?"
                          onChange={(event) =>
                            patchStage(index, {
                              description: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Stage duration">
                        <span className="wf-days-input">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            value={stage.days}
                            disabled={!canEdit}
                            onChange={(event) =>
                              patchStage(index, {
                                days: Math.min(
                                  365,
                                  Math.max(
                                    0,
                                    Math.trunc(Number(event.target.value) || 0),
                                  ),
                                ),
                              })
                            }
                          />
                          <span>working days</span>
                        </span>
                      </Field>
                      <div className="wf-field">
                        <span
                          className="wf-field-label"
                          id={`${bodyId}-repeat`}
                        >
                          Repeats per floor
                        </span>
                        <span className="wf-switch-row">
                          <button
                            type="button"
                            role="switch"
                            className="wf-switch"
                            aria-checked={stage.repeatsPerFloor}
                            aria-labelledby={`${bodyId}-repeat`}
                            disabled={!canEdit}
                            onClick={() =>
                              patchStage(index, {
                                repeatsPerFloor: !stage.repeatsPerFloor,
                              })
                            }
                          >
                            <span />
                          </button>
                          {stage.repeatsPerFloor
                            ? 'Yes, repeat per floor'
                            : 'No, runs one time'}
                        </span>
                      </div>
                    </div>
                    {itemDays > stage.days && (
                      <p className="wf-note">
                        Work items add up to {itemDays} days, which extends this
                        stage beyond {stage.days} days.
                      </p>
                    )}

                    <div className="wf-sequence-head">
                      <strong>Work sequence</strong>
                      <span>
                        Drag to reorder work items in the sequence they are
                        executed.
                      </span>
                    </div>
                    {stage.items.length === 0 && (
                      <p className="wf-empty">No work items yet.</p>
                    )}
                    <ol className="wf-items">
                      {stage.items.map((item, itemIndex) => (
                        <li
                          key={item.id}
                          className="wf-item"
                          style={{ '--i': itemIndex } as CSSProperties}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            const data =
                              event.dataTransfer.getData('text/plain');
                            if (!data.startsWith('item:')) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const [fromStage, fromItem] = data
                              .slice(5)
                              .split(':')
                              .map(Number);
                            if (
                              fromStage === index &&
                              Number.isInteger(fromItem)
                            )
                              moveItem(index, fromItem!, itemIndex);
                          }}
                        >
                          <div className="wf-item-row">
                            <Grip
                              label={`Reorder ${item.title}. Use arrow keys to move.`}
                              canEdit={canEdit}
                              onMove={(offset) =>
                                moveItem(index, itemIndex, itemIndex + offset)
                              }
                              onDragStart={(event) => {
                                event.stopPropagation();
                                event.dataTransfer.setData(
                                  'text/plain',
                                  `item:${index}:${itemIndex}`,
                                );
                                const row = event.currentTarget.closest('li');
                                if (row)
                                  event.dataTransfer.setDragImage(row, 16, 16);
                              }}
                            />
                            <input
                              className="wf-item-title"
                              aria-label="Work item title"
                              value={item.title}
                              maxLength={180}
                              disabled={!canEdit}
                              onChange={(event) =>
                                patchItem(index, itemIndex, {
                                  title: event.target.value,
                                })
                              }
                            />
                            <button
                              type="button"
                              className={
                                'wf-icon-button wf-guide-toggle' +
                                (item.guideText || item.guideVideoUrl
                                  ? ' has-guide'
                                  : '')
                              }
                              aria-expanded={openGuide === item.id}
                              aria-controls={`wf-guide-${item.id}`}
                              aria-label={
                                (item.guideText || item.guideVideoUrl
                                  ? 'Edit site guide'
                                  : '+ Add guide') +
                                ' for ' +
                                item.title
                              }
                              title={
                                item.guideText || item.guideVideoUrl
                                  ? 'Edit site guide'
                                  : '+ Add guide'
                              }
                              onClick={() =>
                                setOpenGuide((current) =>
                                  current === item.id ? null : item.id,
                                )
                              }
                            >
                              <Icon name="guide" size={15} />
                            </button>
                            <ItemKindPicker
                              value={item.kind}
                              disabled={!canEdit}
                              label="Item type"
                              onChange={(kind) =>
                                patchItem(index, itemIndex, {
                                  kind,
                                  ...(kind === 'payment' ? { days: 0 } : {}),
                                })
                              }
                            />
                            <label className="wf-item-days">
                              <input
                                type="number"
                                min="0"
                                max="365"
                                aria-label="Item days"
                                value={item.days}
                                disabled={!canEdit || item.kind === 'payment'}
                                onChange={(event) =>
                                  patchItem(index, itemIndex, {
                                    days: Math.min(
                                      365,
                                      Math.max(
                                        0,
                                        Math.trunc(
                                          Number(event.target.value) || 0,
                                        ),
                                      ),
                                    ),
                                  })
                                }
                              />
                              <span>d</span>
                            </label>
                            {canEdit && (
                              <button
                                type="button"
                                className="wf-icon-button wf-item-remove"
                                aria-label={`Remove ${item.title}`}
                                onClick={() =>
                                  patchStage(index, {
                                    items: stage.items.filter(
                                      (_, i) => i !== itemIndex,
                                    ),
                                  })
                                }
                              >
                                <Icon name="close" size={14} />
                              </button>
                            )}
                          </div>
                          {openGuide === item.id && (
                            <div
                              className="wf-guide"
                              id={`wf-guide-${item.id}`}
                            >
                              <textarea
                                aria-label="Guide text"
                                value={item.guideText ?? ''}
                                maxLength={1800}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  patchItem(index, itemIndex, {
                                    guideText: event.target.value,
                                  })
                                }
                                placeholder="How the site engineer should do or verify this item"
                              />
                              <input
                                aria-label="Guide video URL"
                                type="url"
                                value={item.guideVideoUrl ?? ''}
                                maxLength={1000}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  patchItem(index, itemIndex, {
                                    guideVideoUrl: event.target.value,
                                  })
                                }
                                placeholder="https:// video guide"
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                    {canEdit && (
                      <div className="wf-add-item">
                        <ItemKindPicker
                          value={draftKinds[stage.id] ?? 'work'}
                          label="New item type"
                          onChange={(kind) =>
                            setDraftKinds((all) => ({
                              ...all,
                              [stage.id]: kind,
                            }))
                          }
                        />
                        <input
                          aria-label="Add sequence item title"
                          value={drafts[stage.id] ?? ''}
                          maxLength={180}
                          onChange={(event) =>
                            setDrafts((all) => ({
                              ...all,
                              [stage.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              addItem(index, stage);
                            }
                          }}
                          placeholder="Add work, design, material, check or QC item…"
                        />
                        <button
                          type="button"
                          className="wf-button wf-button-soft"
                          aria-label="Add sequence item"
                          onClick={() => addItem(index, stage)}
                        >
                          <Icon name="plus" size={14} /> Add item
                        </button>
                      </div>
                    )}
                    {canEdit && stages.length > 1 && (
                      <div className="wf-stage-footer">
                        <button
                          type="button"
                          className="wf-text-danger"
                          onClick={() => {
                            mutateStages(
                              (rows) => rows.filter((_, i) => i !== index),
                              true,
                            );
                            setExpandedStage(null);
                          }}
                        >
                          <Icon name="trash" size={14} /> Remove stage
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {canEdit && stages.length < 30 && (
          <button
            className="wf-add-stage"
            type="button"
            onClick={() => {
              const id = `stage-${newId()
                .replace(/[^a-z0-9]/gi, '')
                .slice(0, 8)
                .toLowerCase()}`;
              mutateStages(
                (rows) => [
                  ...rows,
                  {
                    id,
                    name: 'New stage',
                    description: '',
                    repeatsPerFloor: false,
                    days: 1,
                    items: [],
                  },
                ],
                true,
              );
              setExpandedStage(id);
            }}
          >
            <Icon name="plus" size={15} /> Add stage
          </button>
        )}
        <footer className="wf-card-foot">
          <span>
            {stages.length} reusable {industryName} stages · Working days
            exclude Sundays
          </span>
        </footer>
      </section>
    </div>
  );
}
