'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_QUOTE_MESSAGE,
} from '@/lib/meta-lead-fields';
import {
  connectMetaLeadForm,
  createMetaLeadTemplate,
  disconnectMetaAccount,
  disconnectMetaLeadForm,
  importRecentMetaLeads,
  listMetaLeadForms,
  listMetaLeadTemplates,
  saveMetaLeadFollowUp,
  type MetaFormOption,
  type MetaTemplateOption,
} from './meta-lead-actions';
import type { MetaLeadFormView, MetaLeadView } from './meta-lead-view';

type Run = (
  task: () => Promise<{ ok: boolean; message: string }>,
  reload?: boolean,
) => Promise<boolean>;

function FollowUp({
  form,
  view,
  busy,
  run,
}: {
  form: MetaLeadFormView;
  view: MetaLeadView;
  busy: boolean;
  run: Run;
}) {
  const [connectionId, setConnectionId] = useState(
    form.connectionId || view.numbers[0]?.id || '',
  );
  const [confirm, setConfirm] = useState(form.confirmEnabled);
  const [template, setTemplate] = useState(
    form.templateName ? `${form.templateName}|${form.templateLanguage}` : '',
  );
  const [quote, setQuote] = useState(form.quoteEnabled);
  const [message, setMessage] = useState(
    form.quoteMessage || DEFAULT_QUOTE_MESSAGE,
  );
  const [countryCode, setCountryCode] = useState(form.countryCode);
  const [templates, setTemplates] = useState<MetaTemplateOption[] | null>(null);
  const [starterStatus, setStarterStatus] = useState('');
  const [note, setNote] = useState('');

  async function loadTemplates(id = connectionId) {
    if (!id) return;
    const result = await listMetaLeadTemplates(id);
    setTemplates(result.templates);
    setStarterStatus(result.starterStatus);
    setNote(result.ok ? '' : result.message);
  }
  const chosen = templates?.find(
    (item) => `${item.name}|${item.language}` === template,
  );

  if (!view.numbers.length)
    return (
      <p className="crm-integration-caption">
        To message new leads automatically, first connect a WhatsApp number in{' '}
        <Link href="/dashboard/whatsapp">WhatsApp</Link>.
      </p>
    );
  return (
    <fieldset
      className="crm-meta-followup"
      disabled={busy || !view.canAutomate}
    >
      <legend>WhatsApp follow-up</legend>
      <label className="crm-meta-check">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(event) => {
            setConfirm(event.target.checked);
            if (event.target.checked && !templates) void loadTemplates();
          }}
        />
        <span>
          Message each new lead on WhatsApp and ask them to confirm their
          details
        </span>
      </label>
      {confirm && (
        <>
          <label>
            <span>Send from</span>
            <select
              value={connectionId}
              onChange={(event) => {
                setConnectionId(event.target.value);
                setTemplate('');
                void loadTemplates(event.target.value);
              }}
            >
              {view.numbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {number.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Approved message template</span>
            <select
              value={template}
              onFocus={() => {
                if (!templates) void loadTemplates();
              }}
              onChange={(event) => setTemplate(event.target.value)}
            >
              <option value="">
                {templates ? 'Choose a template' : 'Loading templates…'}
              </option>
              {template && !chosen && (
                <option value={template}>{template.split('|')[0]}</option>
              )}
              {templates?.map((item) => (
                <option
                  key={`${item.name}|${item.language}`}
                  value={`${item.name}|${item.language}`}
                >
                  {item.name} ({item.language})
                </option>
              ))}
            </select>
          </label>
          {chosen && <p className="crm-meta-preview">{chosen.body}</p>}
          <p className="crm-integration-caption">
            WhatsApp only allows a first message from a Meta-approved template.
            Variables are filled in this order: {'{{1}}'} lead name, {'{{2}}'}{' '}
            the details they submitted, {'{{3}}'} your company name.
          </p>
          {templates &&
            !templates.some(
              (item) => item.name === DEFAULT_CONFIRMATION_TEMPLATE.name,
            ) &&
            (starterStatus ? (
              <p className="crm-integration-caption">
                The ready-made template is with Meta (
                {starterStatus.toLowerCase()}
                ).{' '}
                <button
                  type="button"
                  className="crm-meta-link"
                  onClick={() => void loadTemplates()}
                >
                  Check again
                </button>
              </p>
            ) : (
              <div className="crm-meta-starter">
                <p className="crm-meta-preview">
                  {DEFAULT_CONFIRMATION_TEMPLATE.body}
                </p>
                <button
                  type="button"
                  className="crm-outline"
                  onClick={async () => {
                    if (await run(() => createMetaLeadTemplate(connectionId)))
                      await loadTemplates();
                  }}
                >
                  Use this ready-made template (send to Meta for approval)
                </button>
              </div>
            ))}
          <label className="crm-meta-check">
            <input
              type="checkbox"
              checked={quote}
              onChange={(event) => setQuote(event.target.checked)}
            />
            <span>When they reply YES, share the quotation message</span>
          </label>
          {quote && (
            <label>
              <span>Quotation message</span>
              <textarea
                rows={7}
                maxLength={1500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <small>
                {'{{name}}'} = lead name, {'{{company}}'} = your company,{' '}
                {'{{packages}}'} = your active packages with rate per sq ft (and
                an estimate when the form asked for the area). Manage packages
                in <Link href="/dashboard/quotations/packages">Packages</Link>.
              </small>
            </label>
          )}
          <label className="crm-meta-code">
            <span>Country code for numbers entered without one</span>
            <input
              value={countryCode}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) =>
                setCountryCode(event.target.value.replace(/\D/g, ''))
              }
            />
          </label>
        </>
      )}
      {note && (
        <p className="crm-integration-caption" role="status">
          {note}
        </p>
      )}
      {view.canAutomate ? (
        <button
          type="button"
          className="crm-primary"
          disabled={confirm && !template}
          onClick={() => {
            const [templateName = '', templateLanguage = ''] =
              template.split('|');
            void run(
              () =>
                saveMetaLeadFollowUp({
                  id: form.id,
                  connectionId,
                  confirmEnabled: confirm,
                  templateName,
                  templateLanguage,
                  quoteEnabled: confirm && quote,
                  quoteMessage: message,
                  countryCode: countryCode || '91',
                }),
              true,
            );
          }}
        >
          Save follow-up
        </button>
      ) : (
        <p className="crm-integration-caption">
          Ask someone who manages WhatsApp automations to change this.
        </p>
      )}
    </fieldset>
  );
}

export function MetaLeadPanel({
  view,
  onClose,
}: {
  view: MetaLeadView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(view.notice);
  const [pageId, setPageId] = useState(view.pages[0]?.id ?? '');
  const [forms, setForms] = useState<MetaFormOption[] | null>(null);
  const [formId, setFormId] = useState('');

  const run: Run = async (task, reload = false) => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await task();
      setFeedback(result.message);
      if (result.ok && reload) {
        router.replace('/dashboard/crm/leads?panel=meta');
        router.refresh();
      }
      return result.ok;
    } catch {
      setFeedback('Could not complete the request. Please retry.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="crm-integrations-panel crm-meta-panel"
      aria-label="Facebook and Instagram lead forms"
    >
      <div className="crm-integrations-top">
        <div>
          <h2>Facebook &amp; Instagram lead forms</h2>
          <p>
            Leads from your Meta lead ads arrive in this CRM the moment they are
            submitted. You can also greet each lead on WhatsApp, confirm their
            details and share your quotation automatically.
          </p>
        </div>
        <button type="button" className="crm-outline" onClick={onClose}>
          Close
        </button>
      </div>
      {feedback && (
        <p className="crm-integration-message" role="status">
          {feedback}
        </p>
      )}
      {!view.configured ? (
        <div className="crm-integrations-details">
          <p role="alert" className="crm-integration-message">
            Meta Lead Ads is not set up on the Business OS server yet.
          </p>
          {view.missing.length > 0 && (
            <p className="crm-integration-caption">
              Missing server settings: {view.missing.join(', ')}. See
              docs/META-LEAD-ADS.md.
            </p>
          )}
          {view.canManage && view.missing.length === 0 && (
            <p className="crm-integration-caption">
              The database update for Meta lead forms has not been applied.
            </p>
          )}
        </div>
      ) : !view.canManage ? (
        <p className="crm-integration-message">
          Ask your company owner or CRM manager to connect Facebook lead forms.
        </p>
      ) : (
        <div className="crm-integrations-details">
          {view.forms.map((form) => (
            <article key={form.id} className="crm-meta-form">
              <header>
                <div>
                  <h3>{form.formName || 'Lead form'}</h3>
                  <p>
                    {form.pageName} · {form.created} added to CRM
                    {form.duplicate ? ` · ${form.duplicate} repeat` : ''}
                    {form.failed ? ` · ${form.failed} not added` : ''}
                    {form.lastLeadAt
                      ? ` · last lead ${new Date(form.lastLeadAt).toLocaleString('en-IN')}`
                      : ' · waiting for the first lead'}
                  </p>
                  {form.lastError && (
                    <p className="crm-meta-error">
                      Last problem: {form.lastError}
                    </p>
                  )}
                </div>
                <div className="crm-integrations-actions">
                  <button
                    type="button"
                    className="crm-outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => importRecentMetaLeads(form.id))
                    }
                  >
                    Import last 30 days
                  </button>
                  <button
                    type="button"
                    className="crm-outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm('Stop receiving leads from this form?')
                      )
                        void run(() => disconnectMetaLeadForm(form.id), true);
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </header>
              <FollowUp form={form} view={view} busy={busy} run={run} />
            </article>
          ))}

          {view.pages.length === 0 ? (
            <>
              <p>
                <strong>Step 1.</strong> Log in with the Facebook account that
                manages your business Page and share the Pages that run lead
                ads.
              </p>
              <form action="/api/meta-leads/oauth/start" method="get">
                <button type="submit" className="crm-primary">
                  Connect Facebook
                </button>
              </form>
            </>
          ) : (
            <div className="crm-meta-add">
              <h3>Connect a lead form</h3>
              <div className="crm-meta-row">
                <label>
                  <span>Facebook Page</span>
                  <select
                    value={pageId}
                    disabled={busy}
                    onChange={(event) => {
                      setPageId(event.target.value);
                      setForms(null);
                      setFormId('');
                    }}
                  >
                    {view.pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="crm-outline"
                  disabled={busy || !pageId}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await listMetaLeadForms(pageId);
                      setForms(result.ok ? result.forms : null);
                      setFormId(result.forms[0]?.formId ?? '');
                      setFeedback(
                        result.ok
                          ? result.forms.length
                            ? ''
                            : 'No unconnected lead forms on this Page. Create a lead form in Meta Ads Manager first.'
                          : result.message,
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Loading…' : 'Show lead forms'}
                </button>
              </div>
              {forms && forms.length > 0 && (
                <div className="crm-meta-row">
                  <label>
                    <span>Lead form</span>
                    <select
                      value={formId}
                      disabled={busy}
                      onChange={(event) => setFormId(event.target.value)}
                    >
                      {forms.map((form) => (
                        <option key={form.formId} value={form.formId}>
                          {form.name} ({form.leadsCount} leads
                          {form.status && form.status !== 'ACTIVE'
                            ? `, ${form.status.toLowerCase()}`
                            : ''}
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="crm-primary"
                    disabled={busy || !formId}
                    onClick={() =>
                      void run(() => connectMetaLeadForm(pageId, formId), true)
                    }
                  >
                    Connect this form
                  </button>
                </div>
              )}
              <div className="crm-integrations-actions">
                <form action="/api/meta-leads/oauth/start" method="get">
                  <button type="submit" className="crm-outline">
                    Reconnect / add Pages
                  </button>
                </form>
                <button
                  type="button"
                  className="crm-outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Disconnect Facebook and stop all lead forms? Existing CRM leads are kept.',
                      )
                    )
                      void run(disconnectMetaAccount, true);
                  }}
                >
                  Disconnect Facebook
                </button>
              </div>
            </div>
          )}
          <p className="crm-integration-caption">
            Your lead form&apos;s privacy text should tell people you may
            contact them on WhatsApp. Anyone who replies STOP is never messaged
            again.
          </p>
        </div>
      )}
    </section>
  );
}
