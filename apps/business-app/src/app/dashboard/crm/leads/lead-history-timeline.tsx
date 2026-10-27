'use client';

import { useState } from 'react';

export type LeadHistoryItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  at: string;
  system: boolean;
};

const filters = [
  ['all', 'All'],
  ['phone_call', 'Calls'],
  ['whatsapp_note', 'WhatsApp'],
  ['follow_up', 'Follow-ups'],
  ['quotation', 'Quotations'],
  ['site_visit', 'Site visits'],
] as const;

function matches(item: LeadHistoryItem, kind: string) {
  if (kind === 'all') return true;
  if (kind === 'quotation')
    return /quot|revision|proposal/i.test(item.type + ' ' + item.title);
  if (kind === 'follow_up')
    return /follow.?up/i.test(item.type + ' ' + item.title);
  if (kind === 'site_visit')
    return /site.?visit/i.test(item.type + ' ' + item.title);
  return item.type === kind;
}

export function LeadHistoryTimeline({
  items,
  timezone = 'Asia/Kolkata',
}: {
  items: LeadHistoryItem[];
  timezone?: string;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = items.filter((item) => matches(item, filter));
  return (
    <section className="crm-history-card" id="lead-history">
      <div className="crm-history-heading">
        <h2>History</h2>
        <p>Every contact, requested callback and progress update in order.</p>
      </div>
      <div
        className="crm-history-filters"
        role="group"
        aria-label="Filter lead history"
      >
        {filters.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            className={filter === key ? 'selected' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length ? (
        <ol className="crm-history-timeline">
          {filtered.map((item) => (
            <li key={item.id}>
              <div className="crm-history-dot" aria-hidden="true">
                {item.type === 'phone_call'
                  ? '☎'
                  : item.type === 'whatsapp_note'
                    ? '✉'
                    : item.system
                      ? '•'
                      : '✓'}
              </div>
              <div className="crm-history-entry">
                <div className="crm-history-entry-header">
                  <strong>{item.title.replaceAll('_', ' ')}</strong>
                  <time dateTime={item.at}>
                    {Number.isNaN(new Date(item.at).getTime())
                      ? ''
                      : new Date(item.at).toLocaleString('en-IN', {
                          timeZone: timezone,
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                  </time>
                </div>
                {item.body && <p>{item.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="crm-history-empty">No matching updates yet.</p>
      )}
    </section>
  );
}
