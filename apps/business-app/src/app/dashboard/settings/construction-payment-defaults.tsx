'use client';

import { useActionState, useState } from 'react';
import {
  type CompanyConstructionStage,
  type CompanyStageItem,
} from '@business-os/core/company-construction-defaults';
import { saveConstructionPaymentDefaults } from './payment-default-actions';

const initialState = { saved: false, message: '' };
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
  const [stages, setStages] = useState<CompanyConstructionStage[]>(() =>\n    initial.map((stage) => ({\n      id: stage.id,\n      name: stage.name,\n      repeatsPerFloor: stage.repeatsPerFloor,\n      days: stage.days,\n      items: stage.items,\n    })),\n  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
      <p className="us-info">
        Set stage days and the order of work, materials, checks, QC and payment\n        markers. Pre-construction and foundation happen once; the remaining\n        stages repeat for each quoted floor. Payment amounts are entered in\n        quotations, never fixed across every project.
      </p>
      {stages.map((stage, index) => (
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
            <input
              aria-label="Stage name"
              value={stage.name}
              disabled={!canEdit}
              onChange={(event) =>
                patchStage(index, { name: event.target.value })
              }
            />
            <label>\n              Stage days{' '}
              <input
                type="number"
                min="0"
                max="365"
                value={stage.days}
                disabled={!canEdit}
                onChange={(event) =>
                  patchStage(index, { days: Number(event.target.value) })
                }
              />
            </label>
          </header>
          <p className="us-info">
            {stage.repeatsPerFloor
              ? 'Repeats for every quoted floor'
              : 'One-time stage'}{' '}
            · Items: {stage.items.length} · {stage.days} planned days
          </p>
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
                  onBlur={(event) => {
                    const n = Number(event.currentTarget.value) - 1;
                    if (Number.isInteger(n) && n >= 0 && n < stage.items.length)
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
                      kind: event.target.value as CompanyStageItem['kind'],
                    })
                  }
                >
                  {['work', 'material', 'check', 'test', 'qc', 'payment'].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind === 'qc'
                        ? 'QC'
                        : kind === 'check'
                          ? 'Site check'
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
                    patchItem(index, itemIndex, { title: event.target.value })
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
                      items: stage.items.filter((_, i) => i !== itemIndex),
                    })
                  }
                >
                  Remove
                </button>
                <details>
                  <summary>Site guide: text & video</summary>
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
                {['work', 'material', 'check', 'test', 'qc', 'payment'].map((kind) => (
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
                placeholder="Add work, material, check, QC or payment"
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
        </section>
      ))}
      <footer className="us-company-stage-save">
        <strong>Payment amounts are set per quotation and floor.</strong>
        {canEdit && (
          <button
            className="us-button-primary"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Save stages & work'}
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
