'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bulkUpdateLeads } from './bulk-lead-actions';
import type { LeadOption, LeadStage, LeadView } from './workspace';

type Selection = Pick<LeadView, 'id' | 'version' | 'assignedTo'>;

export function LeadBulkToolbar({
  selected, visible, assignees, stages, canAssign, canManage, canFollowUp, onClear,
}: {
  selected: Selection[];
  visible: Selection[];
  assignees: LeadOption[];
  stages: LeadStage[];
  canAssign: boolean;
  canManage: boolean;
  canFollowUp: boolean;
  onClear: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<'assign' | 'stage' | 'followup'>('assign');
  const [assignee, setAssignee] = useState('');
  const [stage, setStage] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const recommended = useMemo(() => {
    if (!assignees.length) return null;
    const loads = new Map(assignees.map((person) => [person.value, 0]));
    // This is explicitly a suggestion based on the current page only.
    for (const lead of visible) {
      if (loads.has(lead.assignedTo)) loads.set(lead.assignedTo, (loads.get(lead.assignedTo) ?? 0) + 1);
    }
    return [...assignees].sort((a, b) =>
      (loads.get(a.value) ?? 0) - (loads.get(b.value) ?? 0) || a.label.localeCompare(b.label))[0] ?? null;
  }, [assignees, visible]);

  const actions = [
    ...(canAssign ? [{ value: 'assign', label: 'Assign employee' }] : []),
    ...(canManage ? [{ value: 'stage', label: 'Change status' }] : []),
    ...(canFollowUp ? [{ value: 'followup', label: 'Set follow-up' }] : []),
  ] as const;
  if (!selected.length) return null;

  async function apply() {
    const leads = selected.map(({ id, version }) => ({ id, version }));
    if (action === 'assign' && !assignee) { setMessage('Select an employee first.'); return; }
    if (action === 'stage' && !stage) { setMessage('Choose a status first.'); return; }
    if (action === 'followup' && (!due || Number.isNaN(new Date(due).getTime()) || new Date(due).getTime() <= Date.now())) {
      setMessage('Choose a future follow-up date.'); return;
    }
    if (!window.confirm('Apply ' + (action === 'assign' ? 'employee assignment' : action === 'stage' ? 'status change' : 'follow-up scheduling') +
      ' to ' + leads.length + ' selected lead' + (leads.length === 1 ? '' : 's') + '?')) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await bulkUpdateLeads(action === 'assign'
        ? { action, leads, assignedTo: assignee }
        : action === 'stage'
          ? { action, leads, stageId: stage }
          : { action, leads, dueAt: new Date(due).toISOString() });
      setMessage(result.message);
      if (result.updated && !result.failed) {
        onClear();
        router.refresh();
      } else if (result.updated) {
        // Partial changes need a fresh version snapshot before retry.
        onClear();
        router.refresh();
      }
    } catch {
      setMessage('Unable to update selected leads. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="crm-premium-bulk" aria-label="Bulk lead actions">
    <div className="crm-bulk-title">
      <strong>{selected.length} selected on this page</strong>
      <button type="button" onClick={onClear} disabled={busy}>Clear selection</button>
    </div>
    <div className="crm-bulk-controls">
      <label>
        <span className="sr-only">Bulk action</span>
        <select aria-label="Bulk action" value={action} disabled={busy}
          onChange={(e) => { setAction(e.target.value as typeof action); setMessage(''); }}>
          {actions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {action === 'assign' && canAssign && <>
        <select aria-label="Bulk assign employee" value={assignee} disabled={busy}
          onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Choose employee</option>
          {assignees.map((person) => <option value={person.value} key={person.value}>{person.label}</option>)}
        </select>
        {recommended && <button type="button" className="crm-bulk-suggest"
          disabled={busy} title="Suggested by fewest assignments among the leads on this page, not employee performance"
          onClick={() => setAssignee(recommended.value)}>
          Suggest: {recommended.label}
        </button>}
      </>}
      {action === 'stage' && canManage && <select aria-label="Bulk lead status" value={stage} disabled={busy}
        onChange={(e) => setStage(e.target.value)}>
        <option value="">Choose open status</option>
        {stages.filter((item) => item.outcome === 'open').map((item) =>
          <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>}
      {action === 'followup' && canFollowUp && <input type="datetime-local" aria-label="Bulk follow-up date"
        value={due} disabled={busy} onChange={(e) => setDue(e.target.value)}/>}
      <button type="button" className="crm-bulk-apply" disabled={busy} onClick={() => void apply()}>
        {busy ? 'Updating…' : 'Apply to selected'}
      </button>
    </div>
    {message && <p role="status" className="crm-bulk-message">{message}</p>}
  </section>;
}
