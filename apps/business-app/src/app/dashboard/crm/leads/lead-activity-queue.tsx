'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeLeadActivity } from './lead-activity-actions';

export type ActivityQueueItem = {
  id: string;
  version: number;
  kind: 'followup' | 'visit';
  label: string;
  name: string;
  leadId: string;
  leadNumber: string;
  phone: string;
  date: string;
  notes: string;
  status: string;
};

export function LeadActivityQueue({
  items, total, canManage, page, hasMore,
}: {
  items: ActivityQueueItem[];
  total: number;
  canManage: boolean;
  page: number;
  hasMore: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (item: ActivityQueueItem, status: 'completed' | 'cancelled') => {
    if (status === 'completed' && !outcome.trim()) {
      setError('Record the visit/call result before completing.');
      return;
    }
    if (status === 'cancelled' && !window.confirm('Cancel this scheduled activity?')) return;
    setPending(item.id);
    setError('');
    try {
      const response = await completeLeadActivity({
        id: item.id, version: item.version, kind: item.kind,
        status, outcome: status === 'completed' ? outcome : '',
      });
      if (!response.ok) setError(response.message);
      else {
        setEditing(null);
        setOutcome('');
        router.refresh();
      }
    } catch {
      setError('Unable to update activity. Please retry.');
    } finally {
      setPending(null);
    }
  };
  return <div className="crm-activity-queue-content">
    <p className="crm-activity-count">{total.toLocaleString('en-IN')} scheduled activities match this view.</p>
    {items.length === 0 ? <p className="crm-activity-empty">No matching scheduled activities.</p> :
      <div className="crm-activity-items">{items.map((item) =>
        <article className="crm-activity-item" key={item.kind + ':' + item.id}>
          <div className="crm-activity-item-top">
            <span className="crm-activity-kind">{item.label}</span>
            <time>{Number.isNaN(new Date(item.date).getTime()) ? item.date :
              new Date(item.date).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}</time>
          </div>
          <div className="crm-activity-person">
            <a href={'/dashboard/crm/leads/' + encodeURIComponent(item.leadId)}>
              {item.name}</a>
            <small>{item.leadNumber}</small>
          </div>
          {item.notes && <p className="crm-activity-notes">{item.notes}</p>}
          <div className="crm-activity-commands">
            <a href={'/dashboard/crm/leads/' + encodeURIComponent(item.leadId)}>Open lead</a>
            {item.phone && <a href={'tel:' + item.phone.replace(/[^0-9+]/g, '')}>Call</a>}
            {canManage && <button type="button" disabled={pending === item.id}
              onClick={() => { setEditing(editing === item.id ? null : item.id); setOutcome(''); setError(''); }}>
              Record outcome
            </button>}
          </div>
          {editing === item.id && canManage && <div className="crm-activity-outcome">
            <label>What happened?
              <textarea rows={2} maxLength={3000} value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                placeholder="Met customer, discussed plans, next visit requested…"/>
            </label>
            {error && <p role="alert">{error}</p>}
            <div>
              <button type="button" disabled={pending === item.id || !outcome.trim()}
                onClick={() => void run(item, 'completed')}>Mark completed</button>
              <button type="button" disabled={pending === item.id}
                onClick={() => void run(item, 'cancelled')}>Cancel activity</button>
            </div>
          </div>}
        </article>,
      )}</div>}
    {hasMore && <p className="crm-activity-more">
      <a href={typeof window === 'undefined' ? '#lead-activities' :
        (() => { const u = new URL(window.location.href); u.searchParams.set('page', String(page + 1)); return u.pathname + u.search + '#lead-activities'; })()}>
        Next page →
      </a>
    </p>}
  </div>;
}
