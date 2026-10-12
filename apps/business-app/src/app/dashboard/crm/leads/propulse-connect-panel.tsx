'use client';

import { useState } from 'react';
import {
  connectPropulseLeads,
  disconnectPropulseLeads,
  syncPropulseLeads,
} from './propulse-actions';

export type ProPulseConnectionView = {
  connected: boolean;
  email: string;
  name: string;
  lastSyncedAt: string | null;
  canManage: boolean;
  configured: boolean;
};

export function ProPulseConnectPanel({
  connection,
  onClose,
}: {
  connection: ProPulseConnectionView;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      setFeedback(result.message);
      if (result.ok) window.location.reload();
    } catch {
      setFeedback('Could not complete the request. Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="crm-integrations-panel" aria-label="Connect ProPulse">
      <div className="crm-integrations-top">
        <div>
          <h2>Connect ProPulse</h2>
          <p>
            Purchased and membership-granted ProPulse leads appear in this same
            CRM list.
          </p>
        </div>
        <button type="button" className="crm-outline" onClick={onClose}>
          Close
        </button>
      </div>
      {!connection.configured ? (
        <p role="alert" className="crm-integration-message">
          Lead sync is not configured on the Business OS server. An
          administrator must configure the server-only Supabase service key and
          database migration.
        </p>
      ) : connection.connected ? (
        <div className="crm-integrations-details">
          <p>
            <strong>Connected account:</strong>{' '}
            {connection.name || connection.email}
          </p>
          {connection.email && (
            <p>
              <strong>ProPulse email:</strong> {connection.email}
            </p>
          )}
          <p>
            <strong>Last checked:</strong>{' '}
            {connection.lastSyncedAt
              ? new Date(connection.lastSyncedAt).toLocaleString('en-IN')
              : 'Not synced yet'}
          </p>
          <p>
            New eligible leads are checked automatically when this CRM is open,
            and when you return to the page. Existing contact records stay here.
          </p>
          <div className="crm-integrations-actions">
            <button
              type="button"
              className="crm-primary"
              disabled={busy}
              onClick={() => run(syncPropulseLeads)}
            >
              {busy ? 'Checking…' : 'Sync eligible leads now'}
            </button>
            {connection.canManage && (
              <button
                type="button"
                className="crm-outline"
                disabled={busy}
                onClick={() => run(disconnectPropulseLeads)}
              >
                Disconnect ProPulse
              </button>
            )}
          </div>
        </div>
      ) : connection.canManage ? (
        <div className="crm-integrations-details">
          <p>
            <strong>Different emails are supported.</strong> Sign in to
            whichever ProPulse account owns the purchased leads. Then paste its
            one-time code here.
          </p>
          <a
            href="https://propulsetechnologies.online/api/business-os/link/code"
            target="_blank"
            rel="noopener noreferrer"
            className="crm-outline"
          >
            1. Sign in to ProPulse and get code ↗
          </a>
          <label className="crm-integrations-code">
            <span>2. Paste the one-time ProPulse code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste pairing code (expires in 5 minutes)"
            />
          </label>
          <button
            type="button"
            className="crm-primary"
            disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(code.trim())}
            onClick={() => run(() => connectPropulseLeads(code))}
          >
            {busy ? 'Connecting…' : '3. Connect account'}
          </button>
          <p className="crm-integration-caption">
            Pairing proves account ownership and authorizes read-only delivery.
            It does not transfer account credentials or allow access to unpaid
            public leads.
          </p>
        </div>
      ) : (
        <p className="crm-integration-message">
          Ask your company owner or CRM manager to connect their ProPulse
          account.
        </p>
      )}
      {feedback && (
        <p className="crm-integration-message" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}
