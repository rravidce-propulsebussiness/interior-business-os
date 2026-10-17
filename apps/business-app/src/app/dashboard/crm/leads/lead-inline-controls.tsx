'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCrmCommand } from '../actions';
import { LeadProjectAction } from './lead-project-action';
import { scheduleLeadFollowUp, changeLeadPriority } from './lead-update-actions';
import type { LeadOption, LeadStage, LeadView } from './workspace';

type Row = Pick<LeadView, 'id' | 'name' | 'version' | 'lifecycle' | 'stageId' | 'stageName' | 'assignedTo' | 'nextFollowUpAt' | 'convertedProjectId' | 'quotationProjectId'>;

function localInput(date: string | null): string {
  if (!date) return '';
  const v = new Date(date);
  if (Number.isNaN(v.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return v.getFullYear() + '-' + p(v.getMonth()+1) + '-' + p(v.getDate()) +
    'T' + p(v.getHours()) + ':' + p(v.getMinutes());
}

export function LeadStageSelect({
  lead, stages, lostReasons, canManage, canWin, canConvert = false, canViewProject = false,
}: {
  lead: Row; stages: LeadStage[]; lostReasons: LeadOption[];
  canManage: boolean; canWin: boolean; canConvert?: boolean; canViewProject?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const target = stages.find((s) => s.id === targetId);
  const change = async (id: string, reasonId: string | null = null, message = '') => {
    setPending(true);
    setError('');
    try {
      const result = await runCrmCommand({
        action: 'stage', id: lead.id, version: lead.version,
        stage_id: id, lost_reason_id: reasonId, note: message,
      });
      if (!result.id) setError(result.message);
      else {
        setTargetId('');
        router.refresh();
      }
    } catch {
      setError('Could not update stage.');
    } finally {
      setPending(false);
    }
  };
  if (!canManage || lead.lifecycle === 'archived') return <div className="crm-inline-field">
    <span>{lead.stageName}</span>
    <LeadProjectAction key={lead.id} leadId={lead.id} version={lead.version}
        leadName={lead.name} lifecycle={lead.lifecycle}
        convertedProjectId={lead.convertedProjectId}
        quotationProjectId={lead.quotationProjectId}
        canConvert={canConvert} canViewProject={canViewProject}/>
  </div>;
  return (
    <div className="crm-inline-field">
      <select
        aria-label="Lead stage"
        value={targetId || lead.stageId}
        disabled={pending}
        onChange={(event) => {
          const selected = stages.find((s) => s.id === event.target.value);
          if (!selected) return;
          if (selected.outcome === 'won' || (selected.outcome === 'open' && lead.lifecycle === 'open')) {
            void change(selected.id);
          } else {
            setTargetId(selected.id);
          }
        }}
      >
        {!stages.some((s) => s.id === lead.stageId) && (
          <option value={lead.stageId}>{lead.stageName || 'Current stage'}</option>
        )}
        {stages.filter((s) => s.outcome !== 'won' || canWin).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {target && target.outcome !== 'won' && (target.outcome !== 'open' || lead.lifecycle !== 'open') && (
        <div className="crm-inline-confirm">
          <strong>{target.name}</strong>
          {target.outcome === 'lost' && (
            <select aria-label="Lost reason" value={reason} onChange={(e)=>setReason(e.target.value)}>
              <option value="">Select lost reason</option>
              {lostReasons.map((r)=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          )}
          <textarea
            rows={2}
            aria-label="Stage outcome note"
            placeholder="Optional details"
            value={note}
            maxLength={3000}
            onChange={(e)=>setNote(e.target.value)}
          />
          <div className="crm-inline-confirm-actions">
            <button type="button" onClick={()=>setTargetId('')}>Cancel</button>
            <button type="button" disabled={pending ||
              (target.outcome === 'lost' && !reason)}
              onClick={()=>void change(target.id, target.outcome === 'lost' ? reason : null, note)}>
              Save
            </button>
          </div>
        </div>
      )}
      <LeadProjectAction key={lead.id} leadId={lead.id} version={lead.version}
        leadName={lead.name} lifecycle={lead.lifecycle}
        convertedProjectId={lead.convertedProjectId}
        quotationProjectId={lead.quotationProjectId}
        canConvert={canConvert} canViewProject={canViewProject}/>
      {error && <small role="alert" className="crm-inline-error">{error}</small>}
    </div>
  );
}

export function LeadPrioritySelect({
  lead, canManage,
}: {
  lead: Pick<LeadView, 'id' | 'version' | 'name' | 'priority' | 'lifecycle'>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [pendingPriority, setPendingPriority] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!canManage || lead.lifecycle === 'archived') {
    return <span className={'crm-premium-priority crm-premium-priority-' + lead.priority}>
      {lead.priority}
    </span>;
  }
  return (
    <div className="crm-inline-field">
      <select
        aria-label={'Priority for ' + lead.name}
        value={pendingPriority || lead.priority}
        disabled={pending}
        onChange={async (event) => {
          const next = event.target.value as 'low' | 'normal' | 'high' | 'urgent';
          if (next === lead.priority) return;
          setPending(true);
          setPendingPriority(next);
          setError('');
          try {
            const result = await changeLeadPriority({
              leadId: lead.id,
              version: lead.version,
              priority: next,
            });
            if (result.ok) router.refresh();
            else {
              setPendingPriority(null);
              setError(result.message);
            }
          } catch {
            setPendingPriority(null);
            setError('Could not update priority. Retry.');
          } finally {
            setPending(false);
          }
        }}
      >
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      {error && <small role="alert" className="crm-inline-error">{error}</small>}
    </div>
  );
}

export function LeadAssigneeSelect({
  lead, assignees, canAssign,
}: {
  lead: Row; assignees: LeadOption[]; canAssign: boolean;
}) {
  const router=useRouter();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  if (!canAssign || lead.lifecycle==='archived')
    return <span>{assignees.find((person)=>person.value===lead.assignedTo)?.label || 'Unassigned'}</span>;
  return (
    <div className="crm-inline-field">
      <select
        aria-label="Assigned salesperson"
        value={lead.assignedTo || ''}
        disabled={pending}
        onChange={async(e)=>{
          setPending(true);setError('');
          try {
            const r=await runCrmCommand({
              action:'assign',id:lead.id,version:lead.version,
              assigned_to:e.target.value || null,
            });
            if(r.id) router.refresh(); else setError(r.message);
          } catch {setError('Could not assign this lead.');}
          finally {setPending(false);}
        }}
      >
        <option value="">Unassigned</option>
        {assignees.map((person)=><option key={person.value} value={person.value}>{person.label}</option>)}
      </select>
      {error && <small role="alert" className="crm-inline-error">{error}</small>}
    </div>
  );
}

export function LeadFollowUpSetter({
  lead, canFollowUp,
}: {
  lead: Row; canFollowUp: boolean;
}) {
  const router=useRouter();
  const [due,setDue]=useState(()=>localInput(lead.nextFollowUpAt));
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  if (!canFollowUp || lead.lifecycle==='archived')
    return <span>{lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'}) : 'Not scheduled'}</span>;
  return (
    <div className="crm-inline-followup">
      <input
        type="datetime-local"
        aria-label="Next follow-up date and time"
        value={due}
        onChange={(e)=>setDue(e.target.value)}
        disabled={pending}
      />
      <button
        type="button"
        disabled={pending || !due ||
          due === localInput(lead.nextFollowUpAt)}
        title="Save next follow-up"
        aria-label="Save next follow-up"
        onClick={async()=>{
          const stamp = new Date(due);
          if (Number.isNaN(stamp.getTime())) {setError('Choose a valid date and time.'); return;}
          setPending(true);setError('');
          try {
            const r=await scheduleLeadFollowUp({
              leadId:lead.id,dueAt:stamp.toISOString(),assignedTo:lead.assignedTo||null,
            });
            if(r.ok) router.refresh(); else setError(r.message);
          } catch {setError('Could not schedule follow-up.');}
          finally {setPending(false);}
        }}
      >{pending ? '…' : 'Set'}</button>
      {error && <small role="alert" className="crm-inline-error">{error}</small>}
    </div>
  );
}
