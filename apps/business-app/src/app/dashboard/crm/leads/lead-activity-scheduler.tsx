'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { scheduleLeadActivity } from './lead-activity-actions';
import type { LeadOption } from './workspace';

/** Reused by the lead drawer and lead history, rather than a second visits page. */
export function LeadActivityScheduler({
  leadId, leadName, assignedTo, assignees, defaultLocation = '', canSchedule,
}: {
  leadId: string;
  leadName: string;
  assignedTo: string;
  assignees: LeadOption[];
  defaultLocation?: string;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'call' | 'site_visit' | 'office_visit'>('call');
  const [when, setWhen] = useState('');
  const [assignee, setAssignee] = useState(assignedTo);
  const [location, setLocation] = useState(defaultLocation);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!canSchedule) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const due = new Date(when);
    if (!when || !Number.isFinite(due.getTime()) || due.getTime() <= Date.now()) {
      setError('Choose a future date and time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await scheduleLeadActivity({
        leadId, kind, dueAt: due.toISOString(), assignedTo: assignee || null,
        location: kind === 'call' ? '' : location,
        notes,
      });
      if (!result.ok) {
        setError(result.message);
      } else {
        setOpen(false);
        setWhen('');
        setNotes('');
        router.refresh();
      }
    } catch {
      setError('Unable to schedule. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="crm-activity-scheduler">
    <button type="button" className="crm-activity-open"
      aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? '− Close activity' : '+ Schedule Activity'}
    </button>
    {open && <form onSubmit={(event) => void submit(event)} className="crm-activity-form">
      <h3>Schedule for {leadName}</h3>
      <p>Choose an activity. The sales stage is managed separately.</p>
      <label>Activity type
        <select value={kind} onChange={(event) => {
          setKind(event.target.value as typeof kind);
          setError('');
        }}>
          <option value="call">Follow-up call</option>
          <option value="site_visit">Site visit</option>
          <option value="office_visit">Office visit</option>
        </select>
      </label>
      <label>Date & time
        <input type="datetime-local" required value={when} onChange={(event) => setWhen(event.target.value)}/>
      </label>
      <label>Assigned employee
        <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          <option value="">Lead owner / me</option>
          {assignees.map((member) =>
            <option key={member.value} value={member.value}>{member.label}</option>)}
        </select>
      </label>
      {kind !== 'call' && <label>{kind === 'site_visit' ? 'Site location' : 'Office address'}
        <input required value={location} maxLength={500}
          placeholder={kind === 'site_visit' ? 'Plot / site address' : 'Office address'}
          onChange={(event) => setLocation(event.target.value)}/>
      </label>}
      <label>Notes / purpose (optional)
        <textarea value={notes} maxLength={2400} rows={2}
          placeholder="What should the assigned employee discuss?"
          onChange={(event) => setNotes(event.target.value)}/>
      </label>
      {error && <p role="alert" className="crm-activity-error">{error}</p>}
      <button type="submit" disabled={busy} className="crm-activity-save">
        {busy ? 'Scheduling…' : 'Save Activity'}
      </button>
    </form>}
  </div>;
}
