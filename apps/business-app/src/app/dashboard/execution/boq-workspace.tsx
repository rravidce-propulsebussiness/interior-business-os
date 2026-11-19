'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BOQ_TEMPLATES,
  calculateBoq,
  inputDefinitions,
  type BoqInputs,
} from './boq-calculations';
import { removeManualBoq, saveManualBoq } from './boq-actions';

type Rate = {
  key: string;
  label: string;
  unit: string;
  rate: number;
  category: 'material' | 'labour' | 'other';
};
type SavedLine = {
  id: string;
  name: string;
  section: string;
  kind: string;
  unit: string;
  inputs: BoqInputs;
  outputs: {
    name: string;
    quantity: number;
    unit: string;
    source?: string;
    rate?: number;
  }[];
  quotedPrice?: number;
  quoteLineId?: string;
  notes?: string;
};
type Document = {
  id: string;
  title: string;
  status: 'draft' | 'final';
  project_id: string | null;
  quotation_revision_id: string | null;
  currency: string;
  version: number;
  document: { items?: SavedLine[] };
  updated_at: string;
};
type QuoteLine = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  amount: number;
  area: string;
};
type Quote = {
  id: string;
  projectId: string;
  label: string;
  lines: QuoteLine[];
};
type Project = { id: string; name: string; code: string };
const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
const keyFor = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;
const rateFor = (rates: Map<string, Rate>, name: string, unit: string) => {
  const exact = rates.get(keyFor(name, unit));
  if (exact) return exact.rate;
  const normalized = name.trim().toLowerCase();
  return (
    [...rates.values()].find(
      (rate) =>
        normalized.startsWith(rate.label.trim().toLowerCase()) &&
        rate.unit.toLowerCase() === unit.toLowerCase(),
    )?.rate ?? 0
  );
};
const uid = () => crypto.randomUUID();

export function BoqWorkspace({
  documents,
  projects,
  quotes,
  rates: initialRates,
  canEdit,
  canCreate,
  canViewCost,
}: {
  documents: Document[];
  projects: Project[];
  quotes: Quote[];
  rates: Rate[];
  canEdit: boolean;
  canCreate: boolean;
  canViewCost: boolean;
}) {
  const [active, setActive] = useState<Document | null>(null);
  const [title, setTitle] = useState('Construction BOQ');
  const [projectId, setProjectId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [status, setStatus] = useState<'draft' | 'final'>('draft');
  const [lines, setLines] = useState<SavedLine[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('column');
  const [newName, setNewName] = useState('');
  const [inputs, setInputs] = useState<BoqInputs>(() =>
    Object.fromEntries(
      (inputDefinitions.column ?? []).map((item) => [item.key, item.value]),
    ),
  );
  const [selectedQuoteLines, setSelectedQuoteLines] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const rateMap = useMemo(
    () => new Map(initialRates.map((rate) => [rate.key, rate])),
    [initialRates],
  );
  const currentQuote = quotes.find((quote) => quote.id === quoteId);
  const activeProject = projects.find((project) => project.id === projectId);
  const allOutputs = lines.flatMap((line) =>
    line.outputs.map((output) => ({
      ...output,
      lineId: line.id,
      lineName: line.name,
      rate: Number(output.rate ?? rateFor(rateMap, output.name, output.unit)),
      section: line.section,
    })),
  );
  const grouped = new Map<
    string,
    {
      name: string;
      unit: string;
      quantity: number;
      amount: number;
      section: string;
    }
  >();
  for (const row of allOutputs) {
    const key = keyFor(row.name, row.unit);
    const prior = grouped.get(key);
    const quantity = (prior?.quantity ?? 0) + row.quantity;
    const amount = (prior?.amount ?? 0) + row.quantity * row.rate;
    grouped.set(key, {
      name: row.name,
      unit: row.unit,
      quantity,
      amount,
      section: prior?.section || row.section,
    });
  }
  const materialCost = [...grouped.values()].reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const quotedValue = lines.reduce(
    (sum, line) => sum + (line.quotedPrice ?? 0),
    0,
  );

  function startNew() {
    setActive(null);
    setTitle(
      activeProject
        ? `${activeProject.name} · Construction BOQ`
        : 'Construction BOQ',
    );
    setProjectId('');
    setQuoteId('');
    setStatus('draft');
    setLines([]);
    setMessage('');
  }
  function openDocument(document: Document) {
    setActive(document);
    setTitle(document.title);
    setProjectId(document.project_id || '');
    setQuoteId(document.quotation_revision_id || '');
    setStatus(document.status);
    setLines(document.document?.items || []);
    setMessage('');
  }
  function chooseTemplate(kind: string) {
    setSelectedTemplate(kind);
    const values = inputDefinitions[kind] || [];
    setInputs(Object.fromEntries(values.map((item) => [item.key, item.value])));
    setNewName(
      kind === 'surface'
        ? 'Internal plaster'
        : kind === 'manual'
          ? ''
          : BOQ_TEMPLATES.find((row) => row.kind === kind)?.label || '',
    );
  }
  function addLine() {
    const template = BOQ_TEMPLATES.find(
      (item) => item.kind === selectedTemplate,
    );
    if (!template) return;
    const generated = calculateBoq(selectedTemplate, inputs);
    const itemName = newName.trim() || template.label;
    setLines((prior) => [
      ...prior,
      {
        id: uid(),
        name: itemName,
        section: template.section,
        kind: selectedTemplate,
        unit: generated[0]?.unit || 'each',
        inputs: { ...inputs },
        outputs: generated.map((output) => {
          const rate = rateFor(rateMap, output.name, output.unit);
          return rate > 0 ? { ...output, rate } : output;
        }),
        notes: '',
      },
    ]);
    setNewName('');
  }
  function updateLine(index: number, update: Partial<SavedLine>) {
    setLines((prior) =>
      prior.map((line, i) => (i === index ? { ...line, ...update } : line)),
    );
  }
  function importQuotedLines() {
    if (!currentQuote) return;
    const alreadyImported = new Set(
      lines.map((line) => line.quoteLineId).filter(Boolean),
    );
    const selected = currentQuote.lines.filter(
      (line) =>
        selectedQuoteLines.includes(line.id) && !alreadyImported.has(line.id),
    );
    if (!selected.length)
      setMessage('Those quote lines are already in this BOQ.');
    setLines((prior) => [
      ...prior,
      ...selected.map((line) => ({
        id: uid(),
        name: line.name,
        section: line.area || 'Quoted scope',
        kind: 'quoted',
        unit: line.unit || 'each',
        inputs: { quantity: Number(line.quantity) || 0 },
        outputs: [
          {
            name: line.name,
            quantity: Number(line.quantity) || 0,
            unit: line.unit || 'each',
            rate: 0,
            source: 'Quotation price is shown separately',
          },
        ],
        quotedPrice: line.amount,
        quoteLineId: line.id,
        notes: line.description,
      })),
    ]);
    setSelectedQuoteLines([]);
  }
  function save() {
    if (!title.trim()) {
      setMessage('Enter a BOQ name.');
      return;
    }
    startTransition(async () => {
      const result = await saveManualBoq({
        id: active?.id,
        version: active?.version,
        title,
        projectId: projectId || null,
        quotationRevisionId: quoteId || null,
        status,
        currency: 'INR',
        items: lines,
      });
      if (!result.ok) {
        setMessage(result.message || 'Could not save BOQ.');
        return;
      }
      setMessage('BOQ saved.');
      setActive({
        id: result.id || active?.id || '',
        title,
        status,
        project_id: projectId || null,
        quotation_revision_id: quoteId || null,
        currency: 'INR',
        version: (active?.version || 0) + 1,
        document: { items: lines },
        updated_at: new Date().toISOString(),
      });
      router.refresh();
    });
  }
  function remove(document: Document) {
    if (!window.confirm(`Delete “${document.title}”?`)) return;
    startTransition(async () => {
      const result = await removeManualBoq(document.id);
      setMessage(
        result.ok ? 'BOQ removed.' : result.message || 'Could not remove BOQ.',
      );
      if (result.ok) setActive(null);
      router.refresh();
    });
  }

  return (
    <main className="erp-page manual-boq">
      <div className="erp-titlebar">
        <div>
          <p className="erp-eyebrow">Construction takeoff</p>
          <h1>BOQ &amp; Estimating</h1>
          <p>
            Measure work, calculate material quantities, and price labour and
            materials from your company rate list.
          </p>
        </div>
        <div className="erp-header-actions">
          {canViewCost && canEdit && (
            <Link
              className="erp-button"
              href="/dashboard/execution/boq/pricing"
            >
              Configure rates
            </Link>
          )}
          {canCreate && (
            <button
              className="erp-button erp-button-primary"
              type="button"
              onClick={startNew}
            >
              ＋ New BOQ
            </button>
          )}
        </div>
      </div>
      <div className="boq-metrics">
        <div>
          <span>BOQs</span>
          <strong>{documents.length}</strong>
        </div>
        <div>
          <span>Material + labour estimate</span>
          <strong>{canViewCost ? money(materialCost) : 'Restricted'}</strong>
        </div>
        <div>
          <span>Imported quotation value</span>
          <strong>{money(quotedValue)}</strong>
        </div>
        <div>
          <span>Measured items</span>
          <strong>{lines.length}</strong>
        </div>
      </div>
      {message && (
        <p className="boq-notice" role="status">
          {message}
        </p>
      )}
      <div className="boq-layout">
        <aside className="boq-register">
          <div className="boq-panel-heading">
            <div>
              <h2>Saved BOQs</h2>
              <span>{documents.length} documents</span>
            </div>
            <button type="button" className="boq-add-small" onClick={startNew}>
              ＋
            </button>
          </div>
          {documents.length ? (
            documents.map((document) => (
              <button
                type="button"
                key={document.id}
                className={`boq-register-item ${active?.id === document.id ? 'active' : ''}`}
                onClick={() => openDocument(document)}
              >
                <span className="boq-document-icon">B</span>
                <span className="boq-register-copy">
                  <strong>{document.title}</strong>
                  <small>
                    {projects.find(
                      (project) => project.id === document.project_id,
                    )?.name || 'No project linked'}{' '}
                    · {document.status}
                  </small>
                </span>
                <span className="boq-register-arrow">›</span>
              </button>
            ))
          ) : (
            <p className="boq-empty">No BOQs yet. Start a measured takeoff.</p>
          )}
        </aside>
        <section className="boq-editor">
          <div className="boq-panel-heading">
            <div>
              <h2>{active ? 'Edit BOQ' : 'New manual BOQ'}</h2>
              <span>
                Keep dimensions, assumptions and linked quote in one place.
              </span>
            </div>
            {active && canEdit && (
              <button
                className="boq-delete"
                type="button"
                onClick={() => remove(active)}
                disabled={busy}
              >
                Delete
              </button>
            )}
          </div>
          <div className="boq-form-grid">
            <label>
              BOQ name
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ground floor construction BOQ"
              />
            </label>
            <label>
              Project
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setQuoteId('');
                }}
              >
                <option value="">Choose project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.code ? ` · ${project.code}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quotation price source
              <select
                value={quoteId}
                onChange={(event) => {
                  const selected = quotes.find(
                    (quote) => quote.id === event.target.value,
                  );
                  setQuoteId(event.target.value);
                  setProjectId(selected?.projectId || projectId);
                  setSelectedQuoteLines([]);
                }}
              >
                <option value="">No quotation linked</option>
                {quotes
                  .filter(
                    (quote) => !projectId || quote.projectId === projectId,
                  )
                  .map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Document status
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as 'draft' | 'final')
                }
              >
                <option value="draft">Draft</option>
                <option value="final">Final</option>
              </select>
            </label>
          </div>
          {currentQuote && (
            <section className="boq-import">
              <div className="boq-import-head">
                <div>
                  <h3>Use quotation prices</h3>
                  <p>
                    Import selected quote lines with their saved quantity and
                    selling price. Quote prices stay separate from your
                    estimated cost.
                  </p>
                </div>
                <button
                  className="erp-button erp-button-primary"
                  type="button"
                  onClick={importQuotedLines}
                  disabled={!selectedQuoteLines.length}
                >
                  Import {selectedQuoteLines.length || ''} selected
                </button>
              </div>
              <div className="boq-quote-list">
                {currentQuote.lines.map((line) => (
                  <label className="boq-quote-row" key={line.id}>
                    <input
                      type="checkbox"
                      checked={selectedQuoteLines.includes(line.id)}
                      onChange={(event) =>
                        setSelectedQuoteLines((prior) =>
                          event.target.checked
                            ? [...prior, line.id]
                            : prior.filter((id) => id !== line.id),
                        )
                      }
                    />
                    <span>
                      <strong>{line.name}</strong>
                      <small>
                        {line.area || 'Quoted scope'} · {line.quantity}{' '}
                        {line.unit}
                      </small>
                    </span>
                    <b>{money(line.amount)}</b>
                  </label>
                ))}
                {!currentQuote.lines.length && (
                  <p>No quote line items were found for this revision.</p>
                )}
              </div>
            </section>
          )}
          <section className="boq-add-work">
            <div className="boq-section-title">
              <div>
                <h3>Add measured work</h3>
                <p>
                  Choose a takeoff and enter the dimensions. Calculated
                  quantities update as you type.
                </p>
              </div>
            </div>
            <div className="boq-template-row">
              {BOQ_TEMPLATES.map((template) => (
                <button
                  key={template.kind}
                  type="button"
                  className={
                    selectedTemplate === template.kind ? 'selected' : ''
                  }
                  onClick={() => chooseTemplate(template.kind)}
                >
                  <span>
                    {template.kind === 'column'
                      ? '▥'
                      : template.kind === 'slab'
                        ? '▤'
                        : template.kind === 'wall'
                          ? '▥'
                          : template.kind === 'surface'
                            ? '▧'
                            : '＋'}
                  </span>
                  {template.label}
                </button>
              ))}
            </div>
            <div className="boq-inputs">
              {(inputDefinitions[selectedTemplate] || [])
                .filter(
                  (definition) =>
                    selectedTemplate !== 'surface' ||
                    (definition.key !== 'coats' && definition.key !== 'waste'),
                )
                .map((definition) => (
                  <label key={definition.key}>
                    {definition.label}
                    {definition.key === 'thickness' &&
                    selectedTemplate === 'wall' ? (
                      <select
                        value={String(
                          inputs[definition.key] ?? definition.value,
                        )}
                        onChange={(event) =>
                          setInputs((prior) => ({
                            ...prior,
                            [definition.key]: event.target.value,
                          }))
                        }
                      >
                        <option value="4">4 inch</option>
                        <option value="9">9 inch</option>
                      </select>
                    ) : (
                      <input
                        type={
                          ['outputName', 'surfaceType', 'unit'].includes(
                            definition.key,
                          )
                            ? 'text'
                            : 'number'
                        }
                        min="0"
                        step="any"
                        value={String(
                          inputs[definition.key] ?? definition.value,
                        )}
                        onChange={(event) =>
                          setInputs((prior) => ({
                            ...prior,
                            [definition.key]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              {selectedTemplate === 'surface' && (
                <>
                  <label>
                    Surface finish
                    <select
                      value={String(inputs.surfaceType || '')}
                      onChange={(event) => {
                        const surfaceType = event.target.value;
                        setInputs((prior) => ({
                          ...prior,
                          surfaceType,
                          coats: surfaceType === 'Internal paint' ? '2' : '1',
                          waste: surfaceType.toLowerCase().includes('tile')
                            ? '5'
                            : '0',
                        }));
                      }}
                    >
                      <option>Internal plaster</option>
                      <option>External plaster</option>
                      <option>Internal paint</option>
                      <option>External paint</option>
                      <option>Floor tile</option>
                      <option>Wall tile</option>
                    </select>
                  </label>
                  {String(inputs.surfaceType || '')
                    .toLowerCase()
                    .includes('paint') && (
                    <label>
                      Number of coats
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={String(inputs.coats || '1')}
                        onChange={(event) =>
                          setInputs((prior) => ({
                            ...prior,
                            coats: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}
                  <label>
                    Wastage (%)
                    <input
                      value={String(inputs.waste || '0')}
                      onChange={(event) =>
                        setInputs((prior) => ({
                          ...prior,
                          waste: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="boq-preview">
              <strong>Calculated takeoff</strong>
              {calculateBoq(selectedTemplate, inputs).map((output) => (
                <span key={output.name}>
                  {output.name}
                  <b>
                    {output.quantity.toLocaleString('en-IN')} {output.unit}
                  </b>
                </span>
              ))}
            </div>
            <div className="boq-add-line">
              <label>
                Work description
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. Ground floor C1–C5 columns"
                />
              </label>
              <button
                type="button"
                className="erp-button erp-button-primary"
                onClick={addLine}
              >
                Add to BOQ
              </button>
            </div>
          </section>
          <section className="boq-takeoff">
            <div className="boq-section-title">
              <div>
                <h3>Measured work &amp; linked quote</h3>
                <p>
                  Expand any item to review its dimensions and calculated
                  material quantities.
                </p>
              </div>
              <span className="boq-count-pill">{lines.length} items</span>
            </div>
            {!lines.length ? (
              <div className="boq-empty-takeoff">
                <span>∑</span>
                <strong>Your takeoff will appear here</strong>
                <small>Add a measured work item or import quote lines.</small>
              </div>
            ) : (
              lines.map((line, index) => (
                <details className="boq-line-card" key={line.id}>
                  <summary>
                    <span className="boq-line-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="boq-line-summary">
                      <strong>{line.name}</strong>
                      <small>
                        {line.section} ·{' '}
                        {line.kind === 'quoted'
                          ? 'Quotation linked'
                          : 'Manual takeoff'}
                      </small>
                    </span>
                    <span className="boq-line-total">
                      {line.quotedPrice !== undefined
                        ? money(line.quotedPrice)
                        : money(
                            line.outputs.reduce(
                              (sum, output) =>
                                sum +
                                output.quantity *
                                  Number(
                                    output.rate ??
                                      rateFor(
                                        rateMap,
                                        output.name,
                                        output.unit,
                                      ),
                                  ),
                              0,
                            ),
                          )}
                    </span>
                    <span className="boq-expand">⌄</span>
                  </summary>
                  <div className="boq-line-detail">
                    {line.kind !== 'quoted' && (
                      <div className="boq-dimensions">
                        {Object.entries(line.inputs)
                          .filter(([key]) => key !== 'outputName')
                          .map(([key, value]) => (
                            <span key={key}>
                              {key.replace(
                                /[A-Z]/g,
                                (letter) => ` ${letter.toLowerCase()}`,
                              )}{' '}
                              <b>{String(value)}</b>
                            </span>
                          ))}
                      </div>
                    )}
                    <div className="boq-output-table">
                      <div
                        className={`boq-output-head ${canViewCost ? '' : 'quantity-only'}`}
                      >
                        <span>Material / labour</span>
                        <span>Quantity</span>
                        {canViewCost && (
                          <>
                            <span>Unit rate</span>
                            <span>Amount</span>
                          </>
                        )}
                      </div>
                      {line.outputs.map((output, outputIndex) => {
                        const rate = Number(
                          output.rate ??
                            rateFor(rateMap, output.name, output.unit),
                        );
                        return (
                          <div
                            className={`boq-output-row ${canViewCost ? '' : 'quantity-only'}`}
                            key={`${output.name}-${outputIndex}`}
                          >
                            <span>
                              {output.name}
                              {output.source && <small>{output.source}</small>}
                            </span>
                            <span>
                              {output.quantity.toLocaleString('en-IN')}{' '}
                              {output.unit}
                            </span>
                            {canViewCost && (
                              <>
                                <span>
                                  {line.kind === 'quoted' ? '—' : money(rate)}
                                </span>
                                <strong>
                                  {line.kind === 'quoted'
                                    ? 'Included in quoted value'
                                    : money(output.quantity * rate)}
                                </strong>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {line.quotedPrice !== undefined && (
                      <div className="boq-quote-price">
                        <span>Quotation price snapshot</span>
                        <strong>{money(line.quotedPrice)}</strong>
                      </div>
                    )}
                    <label className="boq-note">
                      Notes
                      <input
                        value={line.notes || ''}
                        onChange={(event) =>
                          updateLine(index, { notes: event.target.value })
                        }
                        placeholder="Drawing reference, assumptions or scope note"
                      />
                    </label>
                    <button
                      className="boq-remove-line"
                      type="button"
                      onClick={() =>
                        setLines((prior) => prior.filter((_, i) => i !== index))
                      }
                    >
                      Remove item
                    </button>
                  </div>
                </details>
              ))
            )}
          </section>
          <section className="boq-summary">
            <div>
              <span>Material + labour cost estimate</span>
              <strong>
                {canViewCost ? money(materialCost) : 'Rate access required'}
              </strong>
            </div>
            <div>
              <span>Quotation value imported</span>
              <strong>{money(quotedValue)}</strong>
            </div>
          </section>
          <div className="boq-savebar">
            <span>
              {message ||
                (active ? `Revision ${active.version}` : 'Unsaved BOQ')}
            </span>
            {(active ? canEdit : canCreate) && (
              <button
                type="button"
                className="erp-button erp-button-primary"
                onClick={save}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Save BOQ'}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
