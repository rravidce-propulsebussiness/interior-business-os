'use client';

import { useActionState, useState } from 'react';
import {
  type CompanyConstructionStage,
  type CompanyStageItem,
  defaultCompanyConstructionStages,
  defaultInteriorStages,
} from '@business-os/core/company-construction-defaults';
import { saveConstructionPaymentDefaults } from './payment-default-actions';

const move = <T,>(values: T[], from: number, to: number) => {
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
};
const defaultStages = (industry: string): CompanyConstructionStage[] => {
  if (industry === 'construction')
    return structuredClone(defaultCompanyConstructionStages);
  if (industry === 'interior') return structuredClone(defaultInteriorStages);
  const names = ['Planning', 'Delivery', 'Quality review'];
  return names.map((name, index) => ({
    id: `${industry}-${index + 1}`,
    name,
    description: '',
    repeatsPerFloor: industry === 'interior' && index >= 2 && index <= 4,
    days: index === 0 ? 5 : 10,
    items:
      index === 0 && industry === 'interior'
        ? [
            {
              id: `${industry}-price-freeze`,
              kind: 'payment' as const,
              title: 'Price freeze',
              days: 0,
            },
          ]
        : [],
  }));
};
const itemKinds: CompanyStageItem['kind'][] = [
  'work',
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
      : kind === 'payment'
        ? 'Payment'
        : kind[0]!.toUpperCase() + kind.slice(1);

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
    <div className="us-kind-picker">
      <button
        type="button"
        className="us-kind-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
      >
        {kindLabel(value)} <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="us-kind-menu" role="listbox" aria-label={label}>
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
              {value === kind && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const [state, action, pending] = useActionState(
    saveConstructionPaymentDefaults,
    { saved: false, message: '', savedRowsByIndustry: initial },
  );
  const [industryKey, setIndustryKey] = useState(
    industries[0]?.key ?? 'construction',
  );
  const [knownIndustries, setKnownIndustries] = useState(industries);
  const savedByIndustry = state.savedRowsByIndustry ?? initial;
  const [stages, setStages] = useState(
    savedByIndustry[industryKey] ?? defaultStages(industryKey),
  );
  const [newIndustryName, setNewIndustryName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftKinds, setDraftKinds] = useState<
    Record<string, CompanyStageItem['kind']>
  >({});
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const savedStages =
    savedByIndustry[industryKey] ?? defaultStages(industryKey);
  const dirty = JSON.stringify(stages) !== JSON.stringify(savedStages);
  const switchIndustry = (key: string) => {
    setIndustryKey(key);
    setStages(savedByIndustry[key] ?? defaultStages(key));
    setExpandedStage(null);
  };
  const patchStage = (
    index: number,
    patch: Partial<CompanyConstructionStage>,
  ) =>
    setStages((current) =>
      current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)),
    );
  const patchItem = (
    stageIndex: number,
    itemIndex: number,
    patch: Partial<CompanyStageItem>,
  ) =>
    setStages((current) =>
      current.map((stage, i) =>
        i === stageIndex
          ? {
              ...stage,
              items: stage.items.map((item, j) =>
                j === itemIndex ? { ...item, ...patch } : item,
              ),
            }
          : stage,
      ),
    );
  return (
    <form action={action} className="us-company-stage-editor">
      <input type="hidden" name="rows" value={JSON.stringify(stages)} />
      <input type="hidden" name="industryKey" value={industryKey} />
      <div
        className="us-workflow-industries"
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
          <div className="us-add-industry">
            <input
              aria-label="New industry"
              value={newIndustryName}
              onChange={(event) => setNewIndustryName(event.target.value)}
              placeholder="Add industry"
            />
            <button
              type="button"
              onClick={() => {
                const name = newIndustryName.trim();
                const key = name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 60);
                if (
                  !name ||
                  !key ||
                  knownIndustries.some((item) => item.key === key)
                )
                  return;
                setKnownIndustries((all) => [...all, { key, name }]);
                setNewIndustryName('');
                switchIndustry(key);
              }}
            >
              + Add industry
            </button>
          </div>
        )}
      </div>
      <div className="us-workflow-intro">
        <span className="us-workflow-saved">
          {dirty ? '• Unsaved changes' : '✓ Saved'}
        </span>
      </div>
      <div className="us-project-calendar">
        <strong>Working days</strong>
        <span>Sundays excluded from dates</span>
      </div>
      {stages.map((stage, index) => {
        const workItems = stage.items.filter((item) => item.kind !== 'payment');
        const itemDays = workItems.reduce((sum, item) => sum + item.days, 0);
        const totalDays = Math.max(stage.days, itemDays);
        return (
          <section
            className={
              'us-company-stage-card' +
              (expandedStage === stage.id ? ' is-expanded' : ' is-collapsed')
            }
            key={stage.id}
            onClick={(event) => {
              const target = event.target;
              if (!(target instanceof HTMLElement) || !target.closest('header'))
                return;
              if (target.closest('button, input, textarea, label, select'))
                return;
              setExpandedStage((current) =>
                current === stage.id ? null : stage.id,
              );
            }}
            draggable={canEdit}
            onDragStart={(event) =>
              event.dataTransfer.setData('text/plain', String(index))
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData('text/plain'));
              if (Number.isInteger(from) && from !== index)
                setStages((rows) => move(rows, from, index));
            }}
          >
            <header className="us-company-stage-heading">
              <span className="us-stage-grip" aria-label="Drag to reorder">
                ⠿
              </span>
              <span className="us-stage-number">{index + 1}</span>
              <div className="us-company-stage-title">
                <div className="us-stage-title-top">
                  <span className="us-stage-name-preview">
                    {stage.name || 'Untitled stage'}
                  </span>
                  <input
                    aria-label="Stage name"
                    value={stage.name}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchStage(index, { name: event.target.value })
                    }
                  />
                  <span
                    className={
                      stage.repeatsPerFloor
                        ? 'us-stage-repeat'
                        : 'us-stage-once'
                    }
                  >
                    {stage.repeatsPerFloor
                      ? 'REPEAT FOR EACH FLOOR'
                      : 'ONE TIME'}
                  </span>
                  <span className="us-stage-collapse-badge">
                    {stage.repeatsPerFloor ? 'Per floor' : 'One time'}
                  </span>
                  <span className="us-stage-days-preview">{stage.days}d</span>
                </div>
              </div>
              <label className="us-repeat-toggle">
                <input
                  type="checkbox"
                  checked={stage.repeatsPerFloor}
                  disabled={!canEdit}
                  onChange={(event) =>
                    patchStage(index, { repeatsPerFloor: event.target.checked })
                  }
                />{' '}
                Repeats per floor
              </label>
              <label className="us-stage-duration">
                Stage duration
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={stage.days}
                  disabled={!canEdit}
                  onChange={(event) =>
                    patchStage(index, { days: Number(event.target.value) })
                  }
                />
                <span>days</span>
              </label>
              <div className="us-stage-actions">
                <button
                  className="us-stage-toggle"
                  type="button"
                  aria-expanded={expandedStage === stage.id}
                  aria-label={
                    (expandedStage === stage.id ? 'Collapse ' : 'Expand ') +
                    stage.name
                  }
                  onClick={() =>
                    setExpandedStage((current) =>
                      current === stage.id ? null : stage.id,
                    )
                  }
                >
                  {expandedStage === stage.id ? '⌃' : '⌄'}
                </button>
                {canEdit && (
                  <button
                    className="us-stage-remove"
                    type="button"
                    onClick={() =>
                      setStages((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    <span className="us-stage-remove-label">Remove stage</span>
                    <span className="us-stage-remove-icon" aria-hidden="true">
                      ×
                    </span>
                  </button>
                )}
              </div>
            </header>
            {expandedStage === stage.id && (
              <p className="us-stage-total">
                {totalDays} days · {workItems.length} items
                {itemDays > stage.days && (
                  <span> · Substage duration extends this stage</span>
                )}
              </p>
            )}
            {expandedStage === stage.id && (
              <>
                <div className="us-stage-items-heading">
                  <strong>Work sequence</strong>
                </div>
                <div className="us-company-stage-items">
                  {stage.items.map((item, itemIndex) => (
                    <article
                      className="us-company-stage-item"
                      key={item.id}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData(
                          'text/plain',
                          `${index}:${itemIndex}`,
                        );
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const [fromStage, fromItem] = event.dataTransfer
                          .getData('text/plain')
                          .split(':')
                          .map(Number);
                        if (
                          fromStage === index &&
                          fromItem !== undefined &&
                          Number.isInteger(fromItem) &&
                          fromItem !== itemIndex
                        )
                          patchStage(index, {
                            items: move(stage.items, fromItem, itemIndex),
                          });
                      }}
                    >
                      <span className="us-stage-grip">⠿</span>
                      <input
                        className="us-order-number"
                        type="number"
                        min="1"
                        max={stage.items.length}
                        aria-label="Item number"
                        key={`${item.id}:${itemIndex}`}
                        defaultValue={itemIndex + 1}
                        disabled={!canEdit}
                        onBlur={(event) => {
                          const n = Number(event.currentTarget.value) - 1;
                          if (
                            Number.isInteger(n) &&
                            n >= 0 &&
                            n < stage.items.length
                          )
                            patchStage(index, {
                              items: move(stage.items, itemIndex, n),
                            });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                      <ItemKindPicker
                        value={item.kind}
                        disabled={!canEdit}
                        label="Item type"
                        onChange={(kind) =>
                          patchItem(index, itemIndex, { kind })
                        }
                      />
                      <input
                        className="us-stage-item-title"
                        aria-label="Work item title"
                        value={item.title}
                        disabled={!canEdit}
                        onChange={(event) =>
                          patchItem(index, itemIndex, {
                            title: event.target.value,
                          })
                        }
                      />
                      <label>
                        Days{' '}
                        <input
                          type="number"
                          min="0"
                          max="365"
                          value={item.days}
                          disabled={!canEdit}
                          onChange={(event) =>
                            patchItem(index, itemIndex, {
                              days: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          patchStage(index, {
                            items: stage.items.filter(
                              (_, i) => i !== itemIndex,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                      <details>
                        <summary>
                          {item.guideText || item.guideVideoUrl
                            ? 'Edit site guide'
                            : '+ Add guide'}
                        </summary>
                        <textarea
                          aria-label="Guide text"
                          value={item.guideText ?? ''}
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
                          value={item.guideVideoUrl ?? ''}
                          disabled={!canEdit}
                          onChange={(event) =>
                            patchItem(index, itemIndex, {
                              guideVideoUrl: event.target.value,
                            })
                          }
                          placeholder="https:// video guide"
                        />
                      </details>
                    </article>
                  ))}
                </div>
                {canEdit && (
                  <div className="us-company-stage-add">
                    <ItemKindPicker
                      value={draftKinds[stage.id] ?? 'work'}
                      label="New item type"
                      onChange={(kind) =>
                        setDraftKinds((all) => ({ ...all, [stage.id]: kind }))
                      }
                    />
                    <input
                      value={drafts[stage.id] ?? ''}
                      onChange={(event) =>
                        setDrafts((all) => ({
                          ...all,
                          [stage.id]: event.target.value,
                        }))
                      }
                      placeholder="Add work, material, check or QC"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const kind = draftKinds[stage.id] ?? 'work';
                        const title = drafts[stage.id]?.trim();
                        if (!title) return;
                        patchStage(index, {
                          items: [
                            ...stage.items,
                            {
                              id: crypto.randomUUID(),
                              kind,
                              title,
                              days: kind === 'payment' ? 0 : 1,
                            },
                          ],
                        });
                        setDrafts((all) => ({ ...all, [stage.id]: '' }));
                      }}
                    >
                      + Add item
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
      {canEdit && stages.length < 30 && (
        <button
          className="us-stage-add"
          type="button"
          onClick={() => {
            const id = `stage-${crypto.randomUUID().slice(0, 8)}`;
            const stage: CompanyConstructionStage = {
              id,
              name: 'New stage',
              description: '',
              repeatsPerFloor: false,
              days: 1,
              items: [],
            };
            setStages((rows) => [...rows, stage]);
            setExpandedStage(id);
          }}
        >
          + Add stage
        </button>
      )}
      <footer className="us-company-stage-save">
        <strong>
          {stages.length} reusable{' '}
          {knownIndustries.find((item) => item.key === industryKey)?.name ??
            'industry'}{' '}
          stages
        </strong>
        {canEdit && (
          <button
            className="us-button-primary"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Save workflow settings'}
          </button>
        )}
      </footer>
      {state.message && state.industryKey === industryKey && (
        <p role="status" className={state.saved ? 'us-success' : 'us-error'}>
          {state.message}
        </p>
      )}
    </form>
  );
}
