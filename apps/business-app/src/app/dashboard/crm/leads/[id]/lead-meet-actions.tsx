'use client';

import { useState } from 'react';
import { saveCrm } from '../../actions';

function isMeetLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === 'https:' &&
      url.hostname === 'meet.google.com' &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * A consent-free shortcut: Google creates the room in the employee's own
 * account. The employee pastes the new URL before it can be saved or shared.
 * Automatic room creation/invites require a separately authorized Google API
 * integration; the existing Google sign-in alone does not grant that scope.
 */
export function LeadMeetActions({
  leadId,
  leadName,
  email,
  canRecord,
}: {
  leadId: string;
  leadName: string;
  email: string | null;
  canRecord: boolean;
}) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const valid = isMeetLink(link);
  const normalized = link.trim();
  const message = `Hello ${leadName}, here is the Google Meet link for our discussion: ${normalized}`;
  const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(message);
  const emailUrl =
    'mailto:' +
    encodeURIComponent(email ?? '') +
    '?subject=' +
    encodeURIComponent('ProPulse meeting invitation') +
    '&body=' +
    encodeURIComponent(message);

  async function saveMeetingLink() {
    if (!valid || !canRecord) return;
    setBusy(true);
    setFeedback('');
    try {
      const response = await saveCrm('lead_activities', {
        lead_id: leadId,
        activity_type: 'meeting',
        subject: 'Google Meet link',
        body: normalized,
      });
      setFeedback(
        response.message === 'Saved.'
          ? 'Meeting link saved to the lead activity timeline.'
          : response.message || 'Unable to save the meeting link.',
      );
    } catch {
      setFeedback('Unable to save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-lead-meet" aria-label="Google Meet">
      <div className="crm-lead-meet-heading">
        <div>
          <h2>Online meeting · Google Meet</h2>
          <p>Create a meeting, then share its link with the customer.</p>
        </div>
        <a
          className="crm-lead-meet-primary"
          href="https://meet.google.com/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Google Meet ↗
        </a>
      </div>
      <label className="crm-lead-meet-input">
        Meeting link
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            setFeedback('');
          }}
          placeholder="https://meet.google.com/abc-defg-hij"
          aria-describedby="crm-lead-meet-help"
        />
      </label>
      <p id="crm-lead-meet-help" className="crm-lead-meet-hint">
        Copy the link from Google Meet and paste it here. This shortcut uses
        your Google account; it does not automatically schedule an event.
      </p>
      <div className="crm-lead-meet-actions">
        {canRecord && (
          <button type="button" disabled={!valid || busy} onClick={saveMeetingLink}>
            {busy ? 'Saving…' : 'Save to lead'}
          </button>
        )}
        {valid && (
          <>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              Share via WhatsApp ↗
            </a>
            {email && <a href={emailUrl}>Share via email</a>}
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(normalized);
                  setFeedback('Meeting link copied.');
                } catch {
                  setFeedback('Could not copy. Select the link above instead.');
                }
              }}
            >
              Copy link
            </button>
          </>
        )}
      </div>
      {link && !valid && (
        <p className="crm-lead-meet-feedback" role="status">
          Enter a valid meet.google.com meeting URL to share or save it.
        </p>
      )}
      {feedback && <p className="crm-lead-meet-feedback" role="status">{feedback}</p>}
    </section>
  );
}
