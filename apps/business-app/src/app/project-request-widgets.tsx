'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { submitClientProjectRequest } from './client/actions';
import { respondToProjectClientRequest } from './dashboard/projects/project-request-actions';
import './project-request-widgets.css';

export type ProjectClientRequest = {
  id: string;
  kind: string;
  details: string;
  status: string;
  requested_date: string | null;
  response: string;
  created_at: string;
  responded_at: string | null;
};
const label = (text: string) =>
  text.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

export function ClientProjectRequests({
  projectId,
  requests,
}: {
  projectId: string;
  requests: ProjectClientRequest[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState('question');
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFeedback('');
    start(async () => {
      const result = await submitClientProjectRequest(data);
      setFeedback(result.message);
      if (result.ok) {
        form.reset();
        setKind('question');
        router.refresh();
      }
    });
  }
  return (
    <section className="project-request-widget" id="project-requests">
      <header>
        <div>
          <h2>Questions & project requests</h2>
          <p>
            Ask a question, report an issue, request a delay or propose a pooja
            date.
          </p>
        </div>
        <span>{requests.length} requests</span>
      </header>
      <form onSubmit={send} className="project-request-form">
        <input type="hidden" name="project" value={projectId} />
        <label>
          Request type
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="question">Ask a question</option>
            <option value="issue">Report an issue</option>
            <option value="delay">Request work delay</option>
            <option value="pooja">Propose pooja date</option>
          </select>
        </label>
        {(kind === 'pooja' || kind === 'delay') && (
          <label>
            Preferred date
            <input
              name="requestedDate"
              type="date"
              required={kind === 'pooja'}
            />
          </label>
        )}
        <label>
          Details
          <textarea
            name="details"
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            placeholder="Explain what you need the project team to review…"
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send to project team'}
        </button>
        {feedback && (
          <p role="status" className="request-feedback">
            {feedback}
          </p>
        )}
      </form>
      <div className="project-request-feed">
        {requests.map((request) => (
          <article key={request.id}>
            <div className="request-feed-top">
              <strong>{label(request.kind)}</strong>
              <span>{label(request.status)}</span>
            </div>
            <small>
              {when(request.created_at)}
              {request.requested_date
                ? ' · Preferred ' + when(request.requested_date)
                : ''}
            </small>
            <p>{request.details}</p>
            {request.response && (
              <blockquote>
                <b>Project team:</b> {request.response}
              </blockquote>
            )}
          </article>
        ))}
        {!requests.length && (
          <p className="request-empty">
            Your requests and replies will appear here.
          </p>
        )}
      </div>
    </section>
  );
}

export function OwnerProjectRequests({
  projectId,
  requests,
}: {
  projectId: string;
  requests: ProjectClientRequest[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  function respond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFeedback('');
    start(async () => {
      const result = await respondToProjectClientRequest(data);
      setFeedback(result.message);
      if (result.ok) router.refresh();
    });
  }
  if (!requests.length)
    return (
      <p className="request-empty">
        No client questions or schedule requests have been recorded.
      </p>
    );
  return (
    <div className="project-request-widget owner-request-list">
      {requests.slice(0, 6).map((request) => (
        <article key={request.id}>
          <div className="request-feed-top">
            <strong>{label(request.kind)}</strong>
            <span>{label(request.status)}</span>
          </div>
          <small>
            {when(request.created_at)}
            {request.requested_date
              ? ' · Requested ' + when(request.requested_date)
              : ''}
          </small>
          <p>{request.details}</p>
          {request.response && (
            <blockquote>
              <b>Your reply:</b> {request.response}
            </blockquote>
          )}
          <details>
            <summary>
              {request.response ? 'Update response' : 'Reply to client'}
            </summary>
            <form onSubmit={respond} className="project-request-form">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="requestId" value={request.id} />
              <label>
                Decision
                <select
                  name="status"
                  defaultValue={
                    request.status === 'open' ? 'in_review' : request.status
                  }
                >
                  <option value="in_review">In review</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
              <label>
                Reply
                <textarea
                  name="response"
                  required
                  minLength={2}
                  maxLength={2000}
                  rows={3}
                  defaultValue={request.response}
                  placeholder="Explain the decision or updated schedule."
                />
              </label>
              <button disabled={pending}>
                {pending ? 'Saving…' : 'Send reply'}
              </button>
            </form>
          </details>
        </article>
      ))}
      {feedback && (
        <p role="status" className="request-feedback">
          {feedback}
        </p>
      )}
    </div>
  );
}
