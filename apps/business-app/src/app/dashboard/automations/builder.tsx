'use client';
import { useState, useTransition } from 'react';
import {
  actionKinds,
  automationEvents,
  conditionFields,
  priorities,
  ruleSchema,
  type AutomationRule,
} from '@business-os/core/automation';
import { saveRule, testRule, retryJob } from './actions';
const inputClass = 'block w-full rounded border p-2';
export function RuleBuilder({
  initial,
  id: initialId,
  version: initialVersion = 0,
}: {
  initial?: unknown;
  id?: string;
  version?: number;
}) {
  const [rule, setRule] = useState<AutomationRule>(() =>
    ruleSchema.parse(
      initial ?? {
        name: '',
        event: 'lead.created',
        actions: [
          { kind: 'notify', recipient: 'actor', title: 'Review new enquiry' },
        ],
        ...(!initial ? { name: 'New lead reminder' } : {}),
      },
    ),
  );
  const [id, setId] = useState(initialId),
    [version, setVersion] = useState(initialVersion),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  const setAction = (
    index: number,
    patch: Partial<AutomationRule['actions'][number]>,
  ) =>
    setRule({
      ...rule,
      actions: rule.actions.map((a, i) =>
        i === index ? { ...a, ...patch } : a,
      ),
    });
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await saveRule(rule, id, version);
          setMessage(result.message);
          if ('id' in result && result.id) {
            setId(result.id);
            setVersion(result.version);
          }
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          Name
          <input
            className={inputClass}
            value={rule.name}
            maxLength={160}
            required
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
          />
        </label>
        <label>
          Status
          <select
            className={inputClass}
            value={rule.status}
            onChange={(e) =>
              setRule({
                ...rule,
                status: e.target.value as AutomationRule['status'],
              })
            }
          >
            {['paused', 'active', 'disabled', 'archived'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        Description
        <textarea
          className={inputClass}
          maxLength={1000}
          value={rule.description}
          onChange={(e) => setRule({ ...rule, description: e.target.value })}
        />
      </label>
      <fieldset className="grid gap-4 rounded border p-4 md:grid-cols-2">
        <legend className="font-semibold">When</legend>
        <label>
          Event
          <select
            className={inputClass}
            value={rule.event}
            onChange={(e) =>
              setRule({
                ...rule,
                event: e.target.value as AutomationRule['event'],
              })
            }
          >
            {automationEvents.map((event) => (
              <option key={event}>{event}</option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select
            className={inputClass}
            value={rule.mode}
            onChange={(e) =>
              setRule({
                ...rule,
                mode: e.target.value as AutomationRule['mode'],
              })
            }
          >
            {['event', 'delayed', 'scheduled', 'condition'].map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset className="space-y-3 rounded border p-4">
        <legend className="font-semibold">
          If — all conditions must match
        </legend>
        {rule.conditions.length === 0 && (
          <p className="text-sm">
            Every authorized occurrence of this event can match.
          </p>
        )}
        {rule.conditions.map((c, index) => (
          <div key={index} className="grid items-end gap-3 md:grid-cols-4">
            <label>
              Field
              <select
                className={inputClass}
                value={c.field}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    conditions: rule.conditions.map((v, i) =>
                      i === index
                        ? { ...v, field: e.target.value as typeof c.field }
                        : v,
                    ),
                  })
                }
              >
                {conditionFields.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select
                className={inputClass}
                value={c.operator}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    conditions: rule.conditions.map((v, i) =>
                      i === index
                        ? {
                            ...v,
                            operator: e.target.value as typeof c.operator,
                          }
                        : v,
                    ),
                  })
                }
              >
                {['eq', 'ne', 'gt', 'lt', 'gte', 'lte'].map((op) => (
                  <option key={op}>{op}</option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                className={inputClass}
                maxLength={120}
                value={String(c.value)}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    conditions: rule.conditions.map((v, i) =>
                      i === index
                        ? {
                            ...v,
                            value:
                              c.field === 'shortage'
                                ? e.target.value === 'true'
                                : e.target.value,
                          }
                        : v,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="rounded border p-2"
              onClick={() =>
                setRule({
                  ...rule,
                  conditions: rule.conditions.filter((_, i) => i !== index),
                })
              }
            >
              Remove condition
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={rule.conditions.length >= 10}
          className="rounded border px-3 py-2"
          onClick={() =>
            setRule({
              ...rule,
              conditions: [
                ...rule.conditions,
                { field: 'status', operator: 'eq', value: '' },
              ],
            })
          }
        >
          Add condition
        </button>
      </fieldset>
      <fieldset className="space-y-4 rounded border p-4">
        <legend className="font-semibold">Then</legend>
        {rule.actions.map((a, index) => (
          <section
            key={index}
            className="grid gap-4 rounded border p-4 md:grid-cols-2"
          >
            <h3 className="font-semibold md:col-span-2">Action {index + 1}</h3>
            <label>
              Action
              <select
                className={inputClass}
                value={a.kind}
                onChange={(e) =>
                  setAction(index, { kind: e.target.value as typeof a.kind })
                }
              >
                {actionKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Title or activity text
              <input
                className={inputClass}
                required
                maxLength={160}
                value={a.title}
                onChange={(e) => setAction(index, { title: e.target.value })}
              />
            </label>
            <label>
              Recipient
              <select
                className={inputClass}
                value={a.recipient}
                onChange={(e) =>
                  setAction(index, {
                    recipient: e.target.value as typeof a.recipient,
                  })
                }
              >
                {['assignee', 'manager', 'actor', 'user'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {a.recipient === 'user' && (
              <label>
                Member ID
                <input
                  className={inputClass}
                  required
                  value={a.userId ?? ''}
                  onChange={(e) => setAction(index, { userId: e.target.value })}
                />
              </label>
            )}
            <label>
              Priority
              <select
                className={inputClass}
                value={a.priority}
                onChange={(e) =>
                  setAction(index, {
                    priority: e.target.value as typeof a.priority,
                  })
                }
              >
                {priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Timing
              <select
                className={inputClass}
                value={a.dueBasis}
                onChange={(e) =>
                  setAction(index, {
                    dueBasis: e.target.value as typeof a.dueBasis,
                  })
                }
              >
                <option value="event">After event</option>
                <option value="due_before">Before source due date</option>
                <option value="due_after">After source due date</option>
              </select>
            </label>
            <label>
              Delay / offset (minutes)
              <input
                className={inputClass}
                type="number"
                min={0}
                max={525600}
                value={a.delayMinutes}
                onChange={(e) =>
                  setAction(index, { delayMinutes: Number(e.target.value) })
                }
              />
            </label>
            {a.kind === 'email' && (
              <>
                <label>
                  Audience
                  <select
                    className={inputClass}
                    value={a.audience}
                    onChange={(e) =>
                      setAction(index, {
                        audience: e.target.value as typeof a.audience,
                      })
                    }
                  >
                    <option value="internal">Internal</option>
                    <option value="customer">Consenting customer</option>
                  </select>
                </label>
                <label>
                  Email template key
                  <input
                    className={inputClass}
                    value={a.template}
                    required
                    onChange={(e) =>
                      setAction(index, { template: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <button
              type="button"
              disabled={rule.actions.length === 1}
              className="rounded border p-2"
              onClick={() =>
                setRule({
                  ...rule,
                  actions: rule.actions.filter((_, i) => i !== index),
                })
              }
            >
              Remove action
            </button>
          </section>
        ))}
        <button
          type="button"
          disabled={rule.actions.length >= 5}
          className="rounded border px-3 py-2"
          onClick={() =>
            setRule({
              ...rule,
              actions: [
                ...rule.actions,
                {
                  recipient: 'assignee',
                  priority: 'normal',
                  delayMinutes: 0,
                  dueBasis: 'event',
                  template: 'operational_reminder',
                  title: 'Review source',
                  kind: 'notify',
                  audience: 'internal',
                },
              ],
            })
          }
        >
          Add action
        </button>
      </fieldset>
      <fieldset className="grid gap-4 rounded border p-4 md:grid-cols-2">
        <legend className="font-semibold">Frequency limits</legend>
        {(
          [
            {
              key: 'cooldownMinutes',
              label: 'Minimum minutes between repeats',
              min: 1,
              max: 525600,
            },
            {
              key: 'maxPerEntity',
              label: 'Maximum executions per source',
              min: 1,
              max: 20,
            },
            {
              key: 'dailyLimit',
              label: 'Maximum executions per day',
              min: 1,
              max: 1000,
            },
            {
              key: 'scheduleHour',
              label: 'Scheduled hour (organization timezone)',
              min: 0,
              max: 23,
            },
          ] as const
        ).map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              className={inputClass}
              type="number"
              min={f.min}
              max={f.max}
              value={rule[f.key]}
              onChange={(e) =>
                setRule({ ...rule, [f.key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Active rules run with your current source permissions. Saving a revision
        cancels pending actions from the previous revision. Customer email also
        requires organization enablement and recorded consent.
      </p>
      <button disabled={pending} className="rounded border px-4 py-2">
        {pending ? 'Saving…' : 'Save rule'}
      </button>
      <p role="status">
        {message}
        {id && ` Revision ${version}.`}
      </p>
    </form>
  );
}
export function TestRule({
  ruleId,
  events,
}: {
  ruleId: string;
  events: { id: string; label: string }[];
}) {
  const [event, setEvent] = useState(events[0]?.id ?? ''),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<Record<string, unknown> | null>(null),
    [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Test saved rule</h2>
      <label>
        Authorized source event
        <select
          className={inputClass}
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      {!events.length && <p>No visible events are available yet.</p>}
      <button
        disabled={pending || !event}
        className="rounded border px-3 py-2"
        onClick={() =>
          start(async () => {
            const result = await testRule(ruleId, event);
            setMessage(result.message);
            setPreview(result.preview ?? null);
          })
        }
      >
        Preview actions
      </button>
      <p role="status">{message}</p>
      {preview && (
        <div className="space-y-2">
          <p>Matched: {preview.matched ? 'Yes' : 'No'}</p>
          <pre className="overflow-auto whitespace-pre-wrap text-sm">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
export function RetryJob({ id }: { id: string }) {
  const [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  return (
    <div>
      <button
        disabled={pending}
        className="rounded border px-3 py-1"
        onClick={() =>
          start(async () => setMessage((await retryJob(id)).message))
        }
      >
        Retry failed action
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
