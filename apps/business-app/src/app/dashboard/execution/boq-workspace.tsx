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
import {
  MATERIAL_GROUPS,
  materialForOutput,
  rateForOutput,
  variantsFor,
  type Rate,
} from './boq-pricing';
import {
  estimateCounts,
  floorsFromQuote,
  generateQuotationBoq,
  normalizeStructuralSettings,
  type BoqCounts,
  type BoqFloor,
} from '@business-os/core/construction-boq';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';

type Generator = {
  revisionId: string;
  generatedAt: string;
  settings: Record<string, number>;
  counts: BoqCounts;
  floors: BoqFloor[];
  warnings: string[];
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
    material?: string;
    rods?: number;
    diameter?: number;
  }[];
  quotedPrice?: number;
  quoteLineId?: string;
  notes?: string;
  origin?:
    'quotation-structure' | 'quotation-allowance' | 'quotation-additional';
};
type Document = {
  id: string;
  title: string;
  status: 'draft' | 'final';
  project_id: string | null;
  quotation_revision_id: string | null;
  currency: string;
  version: number;
  document: {
    items?: SavedLine[];
    selections?: Record<string, string>;
    generator?: Generator;
  };
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
  schedule: SftEstimateDetails | null;
};
type Project = { id: string; name: string; code: string };
const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
const keyFor = (name: string, unit: string, material?: string) =>
  `${material ? material + '|' : ''}${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;
const uid = () => crypto.randomUUID();

export function BoqWorkspace({
  documents,
  projects,
  quotes,
  rates: initialRates,
  structural,
  initialOpenId,
  initialProjectId,
  canEdit,
  canCreate,
  canViewCost,
}: {
  documents: Document[];
  projects: Project[];
  quotes: Quote[];
  rates: Rate[];
  structural: Record<string, number> | null;
  initialOpenId: string | null;
  initialProjectId: string | null;
  canEdit: boolean;
  canCreate: boolean;
  canViewCost: boolean;
}) {
  const initialDocument =
    documents.find((document) => document.id === initialOpenId) ??
    (initialProjectId
      ? documents.find((document) => document.project_id === initialProjectId)
      : undefined) ??
    null;
  const [active, setActive] = useState<Document | null>(initialDocument);
  const [title, setTitle] = useState(
    initialDocument?.title ?? 'Construction BOQ',
  );
  const [projectId, setProjectId] = useState(
    initialDocument?.project_id ?? initialProjectId ?? '',
  );
  const [quoteId, setQuoteId] = useState(
    initialDocument?.quotation_revision_id ?? '',
  );
  const [status, setStatus] = useState<'draft' | 'final'>(
    initialDocument?.status ?? 'draft',
  );
  const [lines, setLines] = useState<SavedLine[]>(
    initialDocument?.document?.items ?? [],
  );
  const [selections, setSelections] = useState<Record<string, string>>(
    initialDocument?.document?.selections ?? {},
  );
  const [generator, setGenerator] = useState<Generator | null>(
    initialDocument?.document?.generator ?? null,
  );
  const [genFloors, setGenFloors] = useState<BoqFloor[]>(
    initialDocument?.document?.generator?.floors ?? [],
  );
  const [genCounts, setGenCounts] = useState<BoqCounts | null>(
    initialDocument?.document?.generator?.counts ?? null,
  );
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
  const settings = useMemo(
    () => normalizeStructuralSettings(structural),
    [structural],
  );
  const priceOf = (output: SavedLine['outputs'][number]) =>
    rateForOutput(output, initialRates, selections);
  const currentQuote = quotes.find((quote) => quote.id === quoteId);
  const schedule = currentQuote?.schedule ?? null;
  const scheduleFloors = useMemo(
    () =>
      schedule
        ? floorsFromQuote(schedule, settings.defaultFloorHeightFeet)
        : [],
    [schedule, settings.defaultFloorHeightFeet],
  );
  // Edited floor heights / counts belong to the selected quotation and are
  // reset whenever the quotation changes.
  const floorsForGeneration = genFloors.length ? genFloors : scheduleFloors;
  const countsForGeneration =
    genCounts ?? estimateCounts(floorsForGeneration, settings);
  const usedMaterials = new Set(
    lines.flatMap((line) =>
      line.outputs
        .map((output) => materialForOutput(output))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const steelSummary = new Map<number, { kg: number; rods: number }>();
  for (const line of lines)
    for (const output of line.outputs)
      if (output.diameter && output.unit === 'kg') {
        const prior = steelSummary.get(output.diameter) ?? { kg: 0, rods: 0 };
        steelSummary.set(output.diameter, {
          kg: prior.kg + output.quantity,
          rods: prior.rods + (output.rods ?? 0),
        });
      }
  // Steel order per stage (Foundation, Ground Floor, First Floor …), in BOQ
  // order, so steel can be brought floor by floor.
  const diameters = [...steelSummary.keys()].sort((a, b) => a - b);
  const stageSteel = new Map<
    string,
    { kg: number; bars: Map<number, number> }
  >();
  for (const line of lines)
    for (const output of line.outputs)
      if (output.diameter && output.unit === 'kg') {
        const stage = stageSteel.get(line.section) ?? {
          kg: 0,
          bars: new Map<number, number>(),
        };
        stage.kg += output.quantity;
        stage.bars.set(
          output.diameter,
          (stage.bars.get(output.diameter) ?? 0) + (output.rods ?? 0),
        );
        stageSteel.set(line.section, stage);
      }
  const tonnes = (kg: number) =>
    (kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const activeProject = projects.find((project) => project.id === projectId);
  const allOutputs = lines.flatMap((line) =>
    line.outputs.map((output) => ({
      ...output,
      lineId: line.id,
      lineName: line.name,
      rate: priceOf(output),
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
    const key = keyFor(row.name, row.unit, materialForOutput(row));
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
    setSelections({});
    setGenerator(null);
    setGenFloors([]);
    setGenCounts(null);
    setMessage('');
  }
  function openDocument(document: Document) {
    setActive(document);
    setTitle(document.title);
    setProjectId(document.project_id || '');
    setQuoteId(document.quotation_revision_id || '');
    setStatus(document.status);
    setLines(document.document?.items || []);
    setSelections(document.document?.selections ?? {});
    setGenerator(document.document?.generator ?? null);
    setGenFloors(document.document?.generator?.floors ?? []);
    setGenCounts(document.document?.generator?.counts ?? null);
    setMessage('');
  }
  function generateFromQuote() {
    if (!schedule || !quoteId) return;
    const result = generateQuotationBoq({
      details: schedule,
      settings,
      floors: floorsForGeneration,
      counts: countsForGeneration,
    });
    const kept = lines.filter((line) => !line.origin);
    setLines([...result.lines, ...kept]);
    setGenerator({
      revisionId: quoteId,
      generatedAt: new Date().toISOString(),
      settings: result.settings,
      counts: result.counts,
      floors: result.floors,
      warnings: result.warnings,
    });
    setGenFloors(result.floors);
    setGenCounts(result.counts);
    if (!title.trim() || title === 'Construction BOQ')
      setTitle(
        `${activeProject?.name ?? 'Project'} · Construction BOQ`.slice(0, 200),
      );
    setMessage(
      `${result.lines.length} items generated from the quotation${kept.length ? `; ${kept.length} manual items kept` : ''}. Review and save.`,
    );
  }
  function updateOutputQuantity(
    lineIndex: number,
    outputIndex: number,
    quantity: number,
  ) {
    setLines((prior) =>
      prior.map((line, i) =>
        i === lineIndex
          ? {
              ...line,
              outputs: line.outputs.map((output, j) =>
                j === outputIndex
                  ? {
                      ...output,
                      quantity: Number.isFinite(quantity)
                        ? Math.max(0, quantity)
                        : 0,
                    }
                  : output,
              ),
            }
          : line,
      ),
    );
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
        outputs: generated,
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
        selections,
        ...(generator ? { generator } : {}),
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
        document: {
          items: lines,
          selections,
          ...(generator ? { generator } : {}),
        },
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
                  setGenFloors([]);
                  setGenCounts(null);
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
                  setGenFloors([]);
                  setGenCounts(null);
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
          {schedule && (
            <section className="boq-import boq-generate">
              <div className="boq-import-head">
                <div>
                  <h3>Generate from quotation</h3>
                  <p>
                    Floors, sizes and floor heights come from the quotation.
                    Steel is cut from {settings.stockBarFeet} ft bars:{' '}
                    {settings.foundationCuts} pieces per bar for the foundation
                    lift and {settings.floorCuts} per bar for each floor above,
                    with a {settings.lapDiameters}d lap at every floor. Package
                    allowances (per door, per bathroom, per sq ft) are priced at
                    the quoted value. Manual items are kept.
                  </p>
                </div>
                <button
                  className="erp-button erp-button-primary"
                  type="button"
                  onClick={generateFromQuote}
                  disabled={!floorsForGeneration.length}
                >
                  {lines.some((line) => line.origin)
                    ? 'Regenerate BOQ'
                    : 'Generate BOQ'}
                </button>
              </div>
              <div className="boq-gen-floors">
                <div className="boq-gen-floor boq-gen-floor-head">
                  <span>Floor</span>
                  <span>Area</span>
                  <span>Size (ft)</span>
                  <span>Floor height (ft)</span>
                </div>
                {floorsForGeneration.map((floor, floorIndex) => (
                  <div className="boq-gen-floor" key={floor.name}>
                    <strong>{floor.name}</strong>
                    <span>{floor.areaSqft.toLocaleString('en-IN')} sqft</span>
                    <span>
                      {floor.lengthFeet} × {floor.widthFeet}
                    </span>
                    <label>
                      <span className="sr-only">{floor.name} floor height</span>
                      <input
                        type="number"
                        min="7"
                        max="20"
                        step="0.25"
                        value={floor.heightFeet}
                        onChange={(event) => {
                          const heightFeet = Number(event.target.value);
                          setGenFloors(
                            floorsForGeneration.map((item, i) =>
                              i === floorIndex
                                ? {
                                    name: item.name,
                                    areaSqft: item.areaSqft,
                                    lengthFeet: item.lengthFeet,
                                    widthFeet: item.widthFeet,
                                    heightFeet:
                                      heightFeet > 0 ? heightFeet : 10,
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                      {floor.heightAssumed && (
                        <small>Not on quote — assumed</small>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              <div className="boq-gen-counts">
                {(
                  [
                    ['mainDoors', 'Main doors'],
                    ['internalDoors', 'Internal doors'],
                    ['bathrooms', 'Bathrooms'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={countsForGeneration[key]}
                      onChange={(event) =>
                        setGenCounts({
                          ...countsForGeneration,
                          [key]: Math.max(
                            0,
                            Math.round(Number(event.target.value) || 0),
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {canViewCost && canEdit && (
                  <Link
                    className="boq-gen-settings-link"
                    href="/dashboard/execution/boq/pricing"
                  >
                    Column grid, bar sizes, lap &amp; cuts →
                  </Link>
                )}
              </div>
              {generator?.revisionId === quoteId &&
                generator.warnings.length > 0 && (
                  <ul className="boq-gen-warnings">
                    {generator.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
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
                        {line.origin === 'quotation-structure'
                          ? 'Generated from quotation'
                          : line.origin === 'quotation-allowance'
                            ? 'Quoted package allowance'
                            : line.kind === 'quoted'
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
                                sum + output.quantity * priceOf(output),
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
                        const rate = priceOf(output);
                        return (
                          <div
                            className={`boq-output-row ${canViewCost ? '' : 'quantity-only'}`}
                            key={`${output.name}-${outputIndex}`}
                          >
                            <span>
                              {output.name}
                              {output.source && <small>{output.source}</small>}
                            </span>
                            <span className="boq-qty-cell">
                              {line.kind === 'quoted' ? (
                                output.quantity.toLocaleString('en-IN')
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  aria-label={`${output.name} quantity`}
                                  value={output.quantity}
                                  onChange={(event) =>
                                    updateOutputQuantity(
                                      index,
                                      outputIndex,
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              )}{' '}
                              {output.unit}
                              {output.rods ? (
                                <small>{output.rods} bars</small>
                              ) : null}
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
          {(usedMaterials.size > 0 || steelSummary.size > 0) && (
            <section className="boq-materials">
              {canViewCost && (
                <div className="boq-brand-picks">
                  <h3>Brand &amp; source for this BOQ</h3>
                  <div>
                    {MATERIAL_GROUPS.filter((group) =>
                      usedMaterials.has(group.key),
                    ).map((group) => {
                      const options = variantsFor(initialRates, group.key);
                      return (
                        <label key={group.key}>
                          {group.label}
                          <select
                            value={
                              selections[group.key] ?? options[0]?.variant ?? ''
                            }
                            onChange={(event) =>
                              setSelections((prior) => ({
                                ...prior,
                                [group.key]: event.target.value,
                              }))
                            }
                            disabled={!options.length}
                          >
                            {!options.length && (
                              <option value="">Set rates first</option>
                            )}
                            {options.map((option) => (
                              <option key={option.key} value={option.variant}>
                                {option.variant} · {money(option.rate)}/
                                {option.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {steelSummary.size > 0 && (
                <div className="boq-steel-summary">
                  <h3>Steel to bring, floor by floor</h3>
                  <p className="boq-steel-note">
                    Bars of the stock length for each stage, laps included.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Stage</th>
                        {diameters.map((diameter) => (
                          <th key={diameter}>{diameter} mm</th>
                        ))}
                        <th>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...stageSteel.entries()].map(([stage, row]) => (
                        <tr key={stage}>
                          <td>{stage}</td>
                          {diameters.map((diameter) => (
                            <td key={diameter}>
                              {row.bars.get(diameter)
                                ? row.bars
                                    .get(diameter)!
                                    .toLocaleString('en-IN')
                                : '—'}
                            </td>
                          ))}
                          <td>{tonnes(row.kg)} t</td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>Total bars</td>
                        {diameters.map((diameter) => (
                          <td key={diameter}>
                            {(
                              steelSummary.get(diameter)?.rods ?? 0
                            ).toLocaleString('en-IN')}
                          </td>
                        ))}
                        <td>
                          {tonnes(
                            [...steelSummary.values()].reduce(
                              (sum, row) => sum + row.kg,
                              0,
                            ),
                          )}{' '}
                          t
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
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
