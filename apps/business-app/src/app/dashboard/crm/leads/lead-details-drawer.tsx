'use client';

import { useEffect, useState } from 'react';
import { LeadStageSelect, LeadPrioritySelect, LeadFollowUpSetter } from './lead-inline-controls';
import { LeadQuotePreview } from './lead-quote-preview';
import { LeadUpdateComposer } from './lead-update-composer';
import { LeadActivityScheduler } from './lead-activity-scheduler';
import type { LeadOption, LeadStage, LeadView } from './workspace';
import { leadCategoryLabel } from './lead-category';

export function LeadDetailsDrawer({
  lead, onClose, stages, lostReasons, assignees,
  canManage, canWin, canFollowUp, canNote, canQuote,
}: {
  lead: LeadView;
  onClose: () => void;
  stages: LeadStage[];
  lostReasons: LeadOption[];
  assignees: LeadOption[];
  canManage: boolean;
  canWin: boolean;
  canFollowUp: boolean;
  canNote: boolean;
  canQuote: boolean;
}) {
  const [tab, setTab] = useState<'details' | 'quotation' | 'history'>('details');
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); };
  }, [onClose]);
  const detailHref = '/dashboard/crm/leads/' + encodeURIComponent(lead.id);
  const safePhone = (lead.phoneNormalized || lead.phone).replace(/[^+0-9]/g, '');
  const quoteHref = '/dashboard/quotations/new?lead=' + encodeURIComponent(lead.id);
  return <div className="crm-drawer-overlay" onMouseDown={(e) => {
    if (e.currentTarget === e.target) onClose();
  }}>
    <aside className="crm-premium-drawer" role="dialog" aria-modal="true" aria-label={'Lead details: ' + lead.name}>
      <header className="crm-drawer-head">
        <span className="crm-drawer-avatar">{lead.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}</span>
        <div className="crm-drawer-identity"><strong>{lead.name}</strong>
          <small>{leadCategoryLabel(lead.category)}{lead.requirement ? ' · ' + lead.requirement : ''}</small>
        </div>
        <button type="button" className="crm-drawer-close" onClick={onClose} aria-label="Close lead details">×</button>
      </header>
      <div className="crm-drawer-contact">
        <p>{lead.phone || 'Phone not added'}</p>
        {lead.location && <small>{lead.location}</small>}
        {safePhone && <a href={'tel:' + safePhone}>Call customer</a>}
      </div>
      <nav className="crm-drawer-tabs" aria-label="Lead details tabs">
        {(['details','quotation','history'] as const).map((key) =>
          <button type="button" key={key} aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}>{key === 'details' ? 'Overview' : key === 'quotation' ? 'Quotation' : 'History'}</button>)}
      </nav>
      <div className="crm-drawer-body">
        {tab === 'details' && <>
          <h3>Lead details</h3>
          <dl className="crm-drawer-info">
            <div><dt>Service type</dt><dd>{leadCategoryLabel(lead.category)}</dd></div>
            <div><dt>Requirement</dt><dd>{lead.requirement || 'Not provided'}</dd></div>
            <div><dt>Priority</dt><dd><LeadPrioritySelect lead={lead} canManage={canManage}/></dd></div>
            <div><dt>Status</dt><dd><LeadStageSelect lead={lead} stages={stages} lostReasons={lostReasons} canManage={canManage} canWin={canWin}/></dd></div>
            <div><dt>Next follow-up</dt><dd><LeadFollowUpSetter lead={lead} canFollowUp={canFollowUp}/></dd></div>
          </dl>
          <h3>Latest update</h3>
          <div className="crm-drawer-update">
            <strong>{lead.latestUpdateSubject || 'Latest contact'}</strong>
            <p>{lead.latestUpdate || 'No contact recorded yet.'}</p>
            {lead.latestUpdateAt && <small>{new Date(lead.latestUpdateAt).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}</small>}
          </div>
          <LeadActivityScheduler leadId={lead.id} leadName={lead.name}
            assignedTo={lead.assignedTo} assignees={assignees}
            defaultLocation={lead.location} canSchedule={canFollowUp && lead.lifecycle === 'open'}/>
          {canNote && lead.lifecycle !== 'archived' &&
            <LeadUpdateComposer leadId={lead.id} leadName={lead.name} canFollowUp={canFollowUp}/>}
        </>}
        {tab === 'quotation' && <>
          <h3>{lead.quoteShared ? 'Shared quotation' : 'Quotation'}</h3>
          {lead.quoteRevisionId
            ? <LeadQuotePreview revisionId={lead.quoteRevisionId}
              number={lead.quoteNumber || 'Quotation'} amount={lead.quoteAmount}
              status={lead.quoteStatus} shared={lead.quoteShared}/>
            : <p className="crm-drawer-update">No quotation linked to this lead yet.</p>}
          {!lead.quoteRevisionId && canQuote && <a className="crm-drawer-link" href={quoteHref}>Prepare quotation</a>}
          <p className="crm-drawer-hint">Use Preview to review the exact saved quotation and specifications while speaking with the customer.</p>
        </>}
        {tab === 'history' && <>
          <h3>Recent conversation</h3>
          <div className="crm-drawer-update">
            <strong>{lead.latestUpdateSubject || 'Latest contact'}</strong>
            <p>{lead.latestUpdate || 'No contact recorded yet.'}</p>
            {lead.latestUpdateAt && <small>{new Date(lead.latestUpdateAt).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}</small>}
          </div>
          <a className="crm-drawer-link" href={detailHref}>Open complete lead history →</a>
        </>}
      </div>
      <footer className="crm-drawer-footer">
        <a href={detailHref}>Full history</a>
        {lead.quoteRevisionId && <a href={'/dashboard/quotations/'+encodeURIComponent(lead.quoteRevisionId)} className="crm-drawer-main-action">Open quotation</a>}
      </footer>
    </aside>
  </div>;
}
