'use client';
import type { Catalog, Answers } from '@business-os/quotation-engine';
export function QuestionFields({
  attributes,
  options,
  answers,
  setAnswers,
  resolved,
}: {
  attributes: Catalog['attributes'];
  options: Catalog['options'];
  answers: Answers;
  setAnswers: (answers: Answers) => void;
  resolved: { answers: Answers; visible: string[] };
}) {
  return (
    <>
      {attributes
        .filter((a) => resolved.visible.includes(a.key))
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key),
        )
        .map((a) => (
          <label key={a.id} className="grid gap-1">
            {a.label}
            {a.required ? ' *' : ''}
            {['select', 'multi_select'].includes(a.input_type) ? (
              <select
                required={a.required}
                multiple={a.input_type === 'multi_select'}
                value={
                  (resolved.answers[a.key] as string | string[] | undefined) ??
                  (a.input_type === 'multi_select' ? [] : '')
                }
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [a.key]:
                      a.input_type === 'multi_select'
                        ? Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          )
                        : e.target.value,
                  })
                }
                className="rounded border p-2"
              >
                {a.input_type === 'select' && <option value="">Choose</option>}
                {options
                  .filter(
                    (o) => o.attribute_id === a.id && o.status === 'active',
                  )
                  .map((o) => (
                    <option key={o.id} value={o.key}>
                      {o.label}
                    </option>
                  ))}
              </select>
            ) : a.input_type === 'boolean' ? (
              <select
                value={
                  answers[a.key] === undefined ? '' : String(answers[a.key])
                }
                required={a.required}
                onChange={(e) => {
                  const next = { ...answers };
                  if (e.target.value === '') delete next[a.key];
                  else next[a.key] = e.target.value === 'true';
                  setAnswers(next);
                }}
                className="rounded border p-2"
              >
                <option value="">Choose</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                required={a.required}
                value={String(answers[a.key] ?? '')}
                maxLength={1000}
                inputMode={a.input_type === 'number' ? 'decimal' : 'text'}
                onChange={(e) =>
                  setAnswers({ ...answers, [a.key]: e.target.value })
                }
                className="rounded border p-2"
              />
            )}
            <span className="text-muted-foreground">{a.help_text}</span>
          </label>
        ))}
    </>
  );
}
