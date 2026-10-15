'use client';

import { useState } from 'react';
import { runCrmCommand } from '../actions';
import { LeadUpdateComposer } from './lead-update-composer';
import { LeadPrioritySelect } from './lead-inline-controls';
import { LeadQuotePreview } from './lead-quote-preview';
import { LeadRemovalButton } from './lead-removal-button';
import type { LeadStage, LeadView } from './workspace';
import { leadCategoryLabel } from './lead-category';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function phoneLink(phone: string) {
  return phone.replace(/[^+0-9]/g, '');
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();
}

export function LeadsBoardView({
  rows,
  stages,
  canManage,
  canWin,
  canNote,
  canFollowUp,
  onOpen,
}: {
  rows: LeadView[];
  stages: LeadStage[];
  canManage: boolean;
  canWin: boolean;
  canNote: boolean;
  canFollowUp: boolean;
  onOpen: (lead: LeadView) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const move = async (leadId: string, targetId: string) => {
    const lead = rows.find((item) => item.id === leadId);
    const target = stages.find((item) => item.id === targetId);
    if (
      !lead ||
      !target ||
      saving ||
      !canManage ||
      lead.stageId === target.id ||
      lead.lifecycle === 'archived'
    )
      return;
    if (target.outcome !== 'open' || lead.lifecycle !== 'open') {
      onOpen(lead);
      setFeedback(
        'Use the lead details panel to record Won/Lost outcomes or reopen closed leads.',
      );
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      const result = await runCrmCommand({
        action: 'stage',
        id: lead.id,
        version: lead.version,
        stage_id: target.id,
        lost_reason_id: null,
        note: '',
      });
      if (result.message === 'Updated.') {
        window.location.reload();
        return;
      }
      setFeedback(result.message || 'Could not change the stage.');
    } catch {
      setFeedback('Could not change the stage. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    ...stages,
    ...(rows.some((row) => !stages.some((stage) => stage.id === row.stageId))
      ? [{ id: 'unassigned', name: 'Unassigned stage', outcome: 'open' }]
      : []),
  ];

  return (
    <section className="crm-leads-board" aria-label="Lead pipeline board">
      <div className="crm-board-intro">
        <span>
          Drag leads between open stages, or choose a stage from a card.
        </span>
        <span>Won and Lost require confirmation in the lead details.</span>
      </div>
      {feedback && (
        <p role="status" className="crm-board-feedback">
          {feedback}
        </p>
      )}
      {saving && (
        <p role="status" className="crm-board-feedback">
          Saving stage change…
        </p>
      )}
      <div className="crm-board-scroll">
        <div className="crm-board-columns">
          {columns.map((stage) => {
            const cards = rows.filter((lead) =>
              stage.id === 'unassigned'
                ? !stages.some((item) => item.id === lead.stageId)
                : lead.stageId === stage.id,
            );
            const canDrop =
              canManage &&
              stage.outcome === 'open' &&
              stage.id !== 'unassigned';
            return (
              <section
                key={stage.id}
                className="crm-board-column"
                aria-label={stage.name}
                onDragOver={(event) => {
                  if (canDrop && !saving) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canDrop || saving) return;
                  event.preventDefault();
                  void move(event.dataTransfer.getData('text/plain'), stage.id);
                }}
              >
                <header className="crm-board-column-heading">
                  <h3>{stage.name}</h3>
                  <span aria-label={cards.length + ' leads'}>
                    {cards.length}
                  </span>
                </header>
                <div className="crm-board-card-list">
                  {cards.map((lead) => (
                    <article
                      key={lead.id}
                      className="crm-board-card"
                      draggable={
                        canManage && !saving && lead.lifecycle === 'open'
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', lead.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <div className="crm-board-card-top">
                        <span className="crm-board-avatar">
                          {initials(lead.name)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpen(lead)}
                          className="crm-board-card-name"
                          aria-label={'Open ' + lead.name}
                        >
                          {lead.name}
                        </button>
                        <LeadPrioritySelect lead={lead} canManage={canManage} />
                      </div>
                      <span
                        className={
                          'crm-lead-service-badge crm-lead-service-' +
                          (lead.category ?? 'unclassified')
                        }
                      >
                        {leadCategoryLabel(lead.category)}
                      </span>
                      <p className="crm-board-requirement">
                        {lead.requirement ||
                          lead.projectSize ||
                          'No requirement added'}
                      </p>
                      <p className="crm-board-meta">
                        {lead.location || 'Location not provided'}
                        {lead.budgetMin
                          ? ' · ' + currency.format(Number(lead.budgetMin))
                          : ''}
                      </p>
                      <div className="crm-board-latest">
                        <strong>Latest update</strong>
                        <p>{lead.latestUpdate || 'No contact recorded yet'}</p>
                      </div>
                      {lead.quoteRevisionId && (
                        <LeadQuotePreview revisionId={lead.quoteRevisionId}
                          number={lead.quoteNumber || 'Quotation'} status={lead.quoteStatus}
                          amount={lead.quoteAmount} shared={lead.quoteShared}/>
                      )}
                      <div className="crm-board-contact">
                        {phoneLink(lead.phoneNormalized || lead.phone) && (
                          <a
                            href={
                              'tel:' +
                              phoneLink(lead.phoneNormalized || lead.phone)
                            }
                            aria-label={'Call ' + lead.name}
                          >
                            Call
                          </a>
                        )}
                        {phoneLink(lead.phoneNormalized || lead.phone) && (
                          <a
                            href={
                              'https://wa.me/' +
                              (lead.phoneNormalized || lead.phone).replace(
                                /\D/g,
                                '',
                              )
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={'WhatsApp ' + lead.name}
                          >
                            WhatsApp
                          </a>
                        )}
                        <button type="button" onClick={() => onOpen(lead)}>
                          History
                        </button>
                        {canNote && lead.lifecycle !== 'archived' && (
                          <LeadUpdateComposer leadId={lead.id} leadName={lead.name}
                            canFollowUp={canFollowUp}/>
                        )}
                        {canManage && lead.lifecycle !== 'archived' && (
                          <LeadRemovalButton
                            id={lead.id}
                            name={lead.name}
                            version={lead.version}
                          />
                        )}
                      </div>
                      {canManage && lead.lifecycle !== 'archived' && (
                        <label className="crm-board-stage-control">
                          <span>Move stage</span>
                          <select
                            value={lead.stageId}
                            disabled={saving}
                            onChange={(event) =>
                              void move(lead.id, event.target.value)
                            }
                            aria-label={'Move ' + lead.name + ' to stage'}
                          >
                            {!stages.some(
                              (item) => item.id === lead.stageId,
                            ) && (
                              <option value={lead.stageId}>Choose stage</option>
                            )}
                            {stages
                              .filter(
                                (item) =>
                                  item.outcome === 'open' ||
                                  (item.outcome === 'won' && canWin) ||
                                  item.id === lead.stageId,
                              )
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <p className="crm-board-empty">No leads on this page</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
