'use client';

import { useState } from 'react';
import { createQuickLead } from './quick-add-action';

type Option = { value: string; label: string };

export function QuickAddLead({
  sources,
  stages,
  onClose,
}: {
  sources: Option[];
  stages: Option[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [requirement, setRequirement] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceId, setSourceId] = useState(
    sources.find((source) => /manual/i.test(source.label))?.value ??
      sources[0]?.value ?? '',
  );
  const [stageId, setStageId] = useState(stages[0]?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  return (
    <section className="crm-inline-lead-tool" aria-label="Add a lead">
      <div className="crm-inline-tool-title">
        <div>
          <h2>Add a new lead</h2>
          <p>Save the customer directly into All Leads without leaving this page.</p>
        </div>
        <button type="button" className="crm-outline" onClick={onClose}>Close</button>
      </div>
      <form className="crm-quick-add-form" onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setFeedback('');
        try {
          const result = await createQuickLead({
            name, phone, email, location, requirement, notes, sourceId, stageId,
          });
          setFeedback(result.message);
          if (result.ok) window.location.reload();
        } catch {
          setFeedback('Could not save the lead. Please retry.');
        } finally {
          setBusy(false);
        }
      }}>
        <label>Customer name *
          <input value={name} maxLength={200} required
            onChange={(event) => setName(event.target.value)}
            placeholder="Customer name" />
        </label>
        <label>Phone number *
          <input value={phone} maxLength={50} required inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 98765 43210" />
        </label>
        <label>Email
          <input type="email" maxLength={254} value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Optional" />
        </label>
        <label>Location
          <input value={location} maxLength={500}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="City or area" />
        </label>
        <label>Requirement
          <input value={requirement} maxLength={200}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder="e.g. 2 BHK interiors" />
        </label>
        <label>Lead source *
          <select value={sourceId} required
            onChange={(event) => setSourceId(event.target.value)}>
            {!sources.length && <option value="">No sources configured</option>}
            {sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
          </select>
        </label>
        <label>Initial stage *
          <select value={stageId} required
            onChange={(event) => setStageId(event.target.value)}>
            {!stages.length && <option value="">No stages configured</option>}
            {stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          </select>
        </label>
        <label className="crm-quick-add-wide">Notes
          <textarea value={notes} maxLength={5000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Project details, preferred calling time…" rows={3} />
        </label>
        {(!sources.length || !stages.length) && (
          <p role="alert" className="crm-integration-message crm-quick-add-wide">
            Configure lead sources and pipeline stages using Import Sheet → Set up default CRM first.
          </p>
        )}
        {feedback && <p role="status" className="crm-integration-message crm-quick-add-wide">{feedback}</p>}
        <button className="crm-primary" type="submit"
          disabled={busy || !name.trim() || !phone.trim() || !sourceId || !stageId}>
          {busy ? 'Saving lead…' : 'Save lead to All Leads'}
        </button>
      </form>
    </section>
  );
}
