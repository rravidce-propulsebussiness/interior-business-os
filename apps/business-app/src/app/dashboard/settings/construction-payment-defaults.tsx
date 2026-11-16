'use client';

import { useActionState, useState } from 'react';
import {
  type CompanyConstructionStage,
  type CompanyStageItem,
} from '@business-os/core/company-construction-defaults';
import { saveConstructionPaymentDefaults } from './payment-default-actions';

const initialState = { saved: false, message: '' };
const stageDescriptions: Record<string, string> = {
  preconstruction: 'Price freeze, agreement, planning and design approvals.',
  foundation: 'Site preparation, excavation, footing and plinth work.',
  slabs: 'Formwork, reinforcement, services, concrete, curing and slab QC.',
  brickwork: 'External and internal brick or block masonry for each floor.',
  'electrical-plumbing': 'Electrical conduits, wiring, plumbing and testing.',
  tiles: 'Floor and wall tiling, grout, finishing and checks.',
  painting: 'Surface preparation, putty, primer and final coats.',
};
const move = <T,>(values: T[], from: number, to: number) => {
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
};

export function ConstructionPaymentDefaults({
  canEdit,
  initial,
}: {
  canEdit: boolean;
  initial: CompanyConstructionStage[];
}) {
  const [state, action, pending] = useActionState(
    saveConstructionPaymentDefaults,
    initialState,
  );
  const [stages, setStages] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expandedStage, setExpandedStage] = useState<string | null>('slabs');
  const dirty = JSON.stringify(stages) !== JSON.stringify(initial);
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
      <div className="us-workflow-intro">
        <span className="us-workflow-saved">
          {dirty ? '• Unsaved changes' : '✓ Saved'}
        </span>
        <p className="us-info">
          Stages marked per floor repeat automatically for every quoted floor.
          Pre-construction and foundation run once per project. Work items,
          payment markers, checks, QC guides and durations are copied to new
          quotations.
        </p>
      </div>
      <div className="us-project-calendar">
        <strong>Project calendar</strong>
        <span>
          Duration unit: <b>Working days</b>
        </span>
        <span>Sunday is excluded when quotation dates are calculated.</span>
      </div>
      {stages.map((stage, index) => {
        const workItems = stage.items.filter((item) => item.kind !== 'payment');
        const itemDays = workItems.reduce((sum, item) => sum + item.days, 0);
        const totalDays = Math.max(stage.days, itemDays);
        return (
          <section
            className="us-company-stage-card"
            key={stage.id}
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
                    stage.repeatsPerFloor ? 'us-stage-repeat' : 'us-stage-once'
                  }
                >
                  {stage.repeatsPerFloor ? 'REPEAT FOR EACH FLOOR' : 'ONE TIME'}
                </span>
                <p className="us-stage-description">
                  {stageDescriptions[stage.id]}
                  {stage.repeatsPerFloor && (
                    <span> · Automatically repeats for each quoted floor</span>
                  )}
                </p>
              </div>
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
            </header>
            <p className="us-stage-total">
              Stage total: {totalDays} days · {workItems.length} work/check
              steps
              {itemDays > stage.days && (
                <span> · Substage durations extend the stage duration</span>
              )}
            </p>
            {expandedStage === stage.id && (
              <>
                <div className="us-stage-items-heading">
                  <strong>Work sequence</strong>
                  <span>Drag to reorder or enter a sequence number.</span>
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
                      <select
                        value={item.kind}
                        disabled={!canEdit}
                        aria-label="Item type"
                        onChange={(event) =>
                          patchItem(index, itemIndex, {
                            kind: event.target
                              .value as CompanyStageItem['kind'],
                          })
                        }
                      >
                        {[
                          'work',
                          'material',
                          'check',
                          'test',
                          'qc',
                          'payment',
                        ].map((kind) => (
                          <option key={kind} value={kind}>
                            {kind === 'qc'
                              ? 'QC'
                              : kind === 'check'
                                ? 'Site check'
                                : kind === 'payment'
                                  ? 'Payment'
                                  : kind[0]!.toUpperCase() + kind.slice(1)}
                          </option>
                        ))}
                      </select>
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
                    <select
                      id={`kind-${stage.id}`}
                      defaultValue="work"
                      aria-label="New item type"
                    >
                      {[
                        'work',
                        'material',
                        'check',
                        'test',
                        'qc',
                        'payment',
                      ].map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
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
                        const select = document.getElementById(
                          `kind-${stage.id}`,
                        ) as HTMLSelectElement | null;
                        const title = drafts[stage.id]?.trim();
                        if (!title) return;
                        patchStage(index, {
                          items: [
                            ...stage.items,
                            {
                              id: crypto.randomUUID(),
                              kind: (select?.value ??
                                'work') as CompanyStageItem['kind'],
                              title,
                              days: select?.value === 'payment' ? 0 : 1,
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
      <footer className="us-company-stage-save">
        <strong>{stages.length} reusable construction stages</strong>
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
      {state.message && (
        <p role="status" className={state.saved ? 'us-success' : 'us-error'}>
          {state.message}
        </p>
      )}
      <p className="us-info">
        Stage order is the project sequence. The quotation and project timeline
        calculate target dates from the start date and the days entered here.
      </p>
    </form>
  );
}
