'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BOQ_TEMPLATES,
  calculateBoq,
  inputDefinitions,
  type BoqInputs,
} from './boq-calculations';
import { removeManualBoq, saveManualBoq } from './boq-actions';
import { boqProjectOptionLabel } from './boq-project-eligibility';
import {
  fieldKind,
  toDisplay,
  toMetric,
  unitLabel,
  type LengthUnit,
} from './boq-units';
import {
  MATERIAL_GROUPS,
  diameterOf,
  materialForOutput,
  brandSelectionsFromQuote,
  rateForOutput,
  rateGroupKey,
  COST_HEADS,
  QUANTITY_HEADS,
  costHead,
  type CostHead,
  variantsFor,
  type Rate,
} from './boq-pricing';
import {
  estimateCounts,
  normalizeCounts,
  floorsFromQuote,
  generateQuotationBoq,
  normalizeStructuralSettings,
  normalizeDesign,
  type BoqCounts,
  type BoqFloor,
  type StructuralDesign,
} from '@business-os/core/construction-boq';
import { BoqDesignSchedule } from './boq-design-schedule';
import { BoqStageBuilder } from './boq-stage-builder';
import { BoqFloorInputs } from './boq-floor-inputs';
import { NumberField } from './boq-number-field';
import {
  boqCsv,
  boqFileName,
  materialsToOrder,
  type BoqExportRow,
} from './boq-export';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';

type Generator = {
  revisionId: string;
  generatedAt: string;
  settings: Record<string, number>;
  counts: BoqCounts;
  floors: BoqFloor[];
  design?: StructuralDesign | null;
  /** Quantities / rates edited on generated lines, kept on regenerate. */
  overrides?: Record<string, { quantity?: number; rate?: number }>;
  warnings: string[];
  measuredOnly?: boolean;
  repeatFrom?: Record<string, string>;
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
    quotedRate?: number;
    order?: string;
    material?: string;
    rods?: number;
    diameter?: number;
    weightKg?: number;
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
  isFinal: boolean;
  lines: QuoteLine[];
  schedule: SftEstimateDetails | null;
};
type Project = {
  id: string;
  name: string;
  code: string;
  customer_id: string | null;
  customerName: string | null;
};
const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
/** A unit rate: paise are shown when the rate has them (₹9.50/nos). */
const rateMoney = (value: number, currency = 'INR') => {
  const whole = Math.abs((value || 0) - Math.round(value || 0)) < 0.005;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value || 0);
};
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
const keyFor = (name: string, unit: string, material?: string) =>
  `${material ? material + '|' : ''}${name.trim().toLowerCase()}::${unit.trim().toLowerCase()}`;
const uid = () => crypto.randomUUID();
/** Identifies a generated output across regenerations. */
const overrideKey = (
  line: { section: string; kind: string },
  output: { name: string; unit: string },
) => `${line.section}|${line.kind}|${output.name}|${output.unit}`.slice(0, 300);

export function BoqWorkspace({
  documents,
  projects,
  quotes,
  newProjects,
  rates: initialRates,
  structural,
  defaultUnit,
  initialOpenId,
  initialProjectId,
  canEdit,
  canCreate,
  canViewCost,
  initialMode = 'view',
}: {
  documents: Document[];
  projects: Project[];
  quotes: Quote[];
  newProjects: Project[];
  rates: Rate[];
  structural: Record<string, number> | null;
  defaultUnit: LengthUnit;
  initialOpenId: string | null;
  initialProjectId: string | null;
  canEdit: boolean;
  canCreate: boolean;
  canViewCost: boolean;
  initialMode?: 'view' | 'edit' | 'new';
}) {
  const [screen, setScreen] = useState<'view' | 'edit' | 'new'>(
    initialMode === 'new'
      ? 'new'
      : initialMode === 'edit' && canEdit
        ? 'edit'
        : 'view',
  );
  // Coming back to the BOQ page opens the BOQ being worked on: the one
  // asked for, else the project's, else the most recent one.
  const initialDocument =
    initialMode === 'new'
      ? null
      : (documents.find((document) => document.id === initialOpenId) ??
        (initialProjectId
          ? documents.find(
              (document) => document.project_id === initialProjectId,
            )
          : (documents.find(
              (document) =>
                projects.length === 1 &&
                document.project_id === projects[0]!.id,
            ) ?? documents[0])) ??
        null);
  const [active, setActive] = useState<Document | null>(initialDocument);
  const [title, setTitle] = useState(
    initialDocument?.title ?? 'Construction BOQ',
  );
  // For creation, the newest saved quotation is Final by default unless an
  // alternative is manually marked Final. Saved BOQs retain their source.
  const defaultProjectId =
    newProjects.find((project) => project.id === initialProjectId)?.id ??
    (newProjects.length === 1 ? newProjects[0]!.id : '');
  const quoteForProject = (id: string) =>
    quotes.find((quote) => quote.projectId === id && quote.isFinal)?.id ?? '';
  const [projectId, setProjectId] = useState(
    initialDocument ? (initialDocument.project_id ?? '') : defaultProjectId,
  );
  const [quoteId, setQuoteId] = useState(
    initialDocument
      ? (initialDocument.quotation_revision_id ?? '')
      : quoteForProject(defaultProjectId),
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
  const [overrides, setOverrides] = useState<
    Record<string, { quantity?: number; rate?: number }>
  >(initialDocument?.document?.generator?.overrides ?? {});
  const [genDesign, setGenDesign] = useState<StructuralDesign | null>(
    normalizeDesign(initialDocument?.document?.generator?.design),
  );
  const [repeatFrom, setRepeatFrom] = useState<Record<string, string>>(
    initialDocument?.document?.generator?.repeatFrom ?? {},
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('manual');
  const [newName, setNewName] = useState('');
  // Takeoff inputs are always metric; `typed` keeps what the person typed
  // in feet / inches so conversion never fights the cursor.
  const [unit, setUnitState] = useState<LengthUnit>(defaultUnit);
  const [typed, setTyped] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('boq-length-unit');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restores this viewer's saved unit after hydration.
      if (saved === 'm' || saved === 'ft') setUnitState(saved);
    } catch {
      // Storage unavailable: keep the company default.
    }
  }, []);
  function setUnit(next: LengthUnit) {
    setUnitState(next);
    setTyped({});
    try {
      window.localStorage.setItem('boq-length-unit', next);
    } catch {
      // Storage unavailable: the choice lasts for this visit.
    }
  }
  const defsFor = (kind: string) => inputDefinitions[kind] || [];
  const kindOf = (templateKind: string, key: string) => {
    const def = defsFor(templateKind).find((item) => item.key === key);
    return def ? fieldKind(def) : null;
  };
  const [inputs, setInputs] = useState<BoqInputs>(() =>
    Object.fromEntries(
      (inputDefinitions.manual ?? []).map((item) => [item.key, item.value]),
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
  // Saved or edited counts merged over the estimates (older BOQs saved a
  // different shape; anything missing is estimated again).
  const countsForGeneration = normalizeCounts(
    genCounts,
    estimateCounts(floorsForGeneration, settings, schedule ?? undefined),
  );
  const usedMaterials = new Set(
    lines.flatMap((line) =>
      line.outputs
        .map((output) => materialForOutput(output))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  // Reinforcement is bought in rods; weight comes along for reference.
  const steelSummary = new Map<number, { kg: number; rods: number }>();
  for (const line of lines)
    for (const output of line.outputs) {
      const diameter = diameterOf(output);
      if (diameter && output.unit === 'rod') {
        const prior = steelSummary.get(diameter) ?? { kg: 0, rods: 0 };
        steelSummary.set(diameter, {
          kg: prior.kg + (output.weightKg ?? 0),
          rods: prior.rods + output.quantity,
        });
      }
    }
  // Steel order per stage (Foundation, Ground Floor, First Floor …), in BOQ
  // order, so steel can be brought floor by floor.
  const diameters = [...steelSummary.keys()].sort((a, b) => a - b);
  const stageSteel = new Map<
    string,
    { kg: number; bars: Map<number, number> }
  >();
  for (const line of lines)
    for (const output of line.outputs) {
      const diameter = diameterOf(output);
      if (diameter && output.unit === 'rod') {
        const stage = stageSteel.get(line.section) ?? {
          kg: 0,
          bars: new Map<number, number>(),
        };
        stage.kg += output.weightKg ?? 0;
        stage.bars.set(
          diameter,
          (stage.bars.get(diameter) ?? 0) + output.quantity,
        );
        stageSteel.set(line.section, stage);
      }
    }
  // Brand / source choices: one Steel brand for every diameter.
  const steelBrands = [
    ...new Set(
      initialRates
        .filter((rate) => rate.material?.startsWith('steel_') && rate.variant)
        .map((rate) => rate.variant!),
    ),
  ];
  const brandPicks = [
    ...(usedMaterials.has('steel')
      ? [
          {
            key: 'steel',
            label: 'Steel / TMT',
            options: steelBrands.map((brand) => ({
              key: 'steel::' + brand,
              variant: brand,
              text: brand,
            })),
          },
        ]
      : []),
    ...MATERIAL_GROUPS.filter(
      (group) => usedMaterials.has(group.key) && group.key !== 'steel',
    ).map((group) => ({
      key: group.key,
      label: group.label,
      options: variantsFor(initialRates, group.key).map((option) => ({
        key: option.key,
        variant: option.variant!,
        text: `${option.variant} · ${rateMoney(option.rate)}/${option.unit}`,
      })),
    })),
  ].filter((pick) => pick.options.length > 1 || pick.key === 'steel');
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
  // Floor-wise cost in simple heads: cement, sand, aggregate, steel and
  // bricks as quantity × rate; structural labour as rate × sq ft; finishes
  // and services as amounts.
  type HeadTotal = {
    amount: number;
    quantity: number;
    unit: string;
    mixed: boolean;
    items: Map<string, { quantity: number; unit: string; amount: number }>;
  };
  const floorBreakdown = new Map<string, Map<CostHead, HeadTotal>>();
  // What to order per floor (tiles and boxes, coils, pipes …).
  const floorOrders = new Map<string, string[]>();
  for (const row of allOutputs) {
    if (!(row.quantity > 0)) continue;
    if (row.order)
      floorOrders.set(row.section, [
        ...(floorOrders.get(row.section) ?? []),
        `${row.name}: ${row.order}`,
      ]);
    const material = materialForOutput(row);
    const head = costHead(
      material ? rateGroupKey(material, diameterOf(row)) : undefined,
    );
    const isSteel = head === 'Steel';
    const quantity = isSteel
      ? (row.weightKg ?? (row.unit === 'kg' ? row.quantity : 0))
      : row.quantity;
    const unitOf = isSteel ? 'kg' : row.unit;
    const stage =
      floorBreakdown.get(row.section) ?? new Map<CostHead, HeadTotal>();
    const prior = stage.get(head);
    const items =
      prior?.items ??
      new Map<string, { quantity: number; unit: string; amount: number }>();
    const itemKey = `${row.name}::${row.unit}`;
    const item = items.get(itemKey);
    items.set(itemKey, {
      quantity: (item?.quantity ?? 0) + row.quantity,
      unit: row.unit,
      amount: (item?.amount ?? 0) + row.quantity * row.rate,
    });
    stage.set(head, {
      amount: (prior?.amount ?? 0) + row.quantity * row.rate,
      quantity: (prior?.quantity ?? 0) + quantity,
      unit: prior?.unit ?? unitOf,
      mixed: Boolean(prior && (prior.mixed || prior.unit !== unitOf)),
      items,
    });
    floorBreakdown.set(row.section, stage);
  }
  // Every quantity with its stage and cost head, for the order list and
  // the download.
  const exportRows: BoqExportRow[] = allOutputs.map((row) => {
    const material = materialForOutput(row);
    return {
      stage: row.section,
      item: row.lineName,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      rate: canViewCost ? row.rate : 0,
      head: costHead(
        material ? rateGroupKey(material, diameterOf(row)) : undefined,
      ),
      order: row.order,
      weightKg: row.weightKg,
    };
  });
  const orderList = materialsToOrder(exportRows, COST_HEADS);
  const [showTakeoff, setShowTakeoff] = useState(false);
  const floorArea = new Map(
    (generator?.floors ?? []).map((floor) => [floor.name, floor.areaSqft]),
  );
  const builtUpSqft = (generator?.floors ?? []).reduce(
    (sum, floor) => sum + floor.areaSqft,
    0,
  );
  // The quotation is what the customer pays; the BOQ is the cost of the
  // work. Compare them, never mix them.
  const quotedValue =
    generator && schedule && generator.revisionId === quoteId
      ? Number(schedule.total) || 0
      : lines.reduce((sum, line) => sum + (line.quotedPrice ?? 0), 0);
  const margin = quotedValue > 0 ? quotedValue - materialCost : 0;

  function downloadCsv() {
    const csv = boqCsv({
      title: title.trim() || 'Construction BOQ',
      project: activeProject
        ? `${activeProject.customerName ? activeProject.customerName + ' · ' : ''}${activeProject.name}`
        : undefined,
      quotation: quotes.find((quote) => quote.id === quoteId)?.label,
      rows: exportRows,
      includeCost: canViewCost,
      quotedValue: canViewCost ? quotedValue : undefined,
      builtUpSqft: builtUpSqft || undefined,
      generatedOn: new Date().toLocaleDateString('en-IN'),
      headOrder: COST_HEADS,
    });
    // The byte-order mark makes Excel read ₹, × and other symbols.
    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = boqFileName(title);
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printBoq() {
    // Open every floor so the printout / PDF has the full breakdown.
    window.document
      .querySelectorAll<HTMLDetailsElement>('.boq-floor-cost')
      .forEach((element) => (element.open = true));
    window.print();
  }
  function selectProject(id: string) {
    // Selecting another project opens its existing BOQ, never reassigns the
    // current saved document to a new project or creates a duplicate.
    const existing = documents.find((document) => document.project_id === id);
    if (existing) {
      openDocument(existing);
      setMessage('Opened the existing BOQ for editing.');
      return;
    }
    if (id && !newProjects.some((project) => project.id === id)) {
      setMessage('Save a quotation for this project first.');
      return;
    }
    setActive(null);
    setProjectId(id);
    setQuoteId(quoteForProject(id));
    setTitle(
      projects.find((project) => project.id === id)
        ? `${projects.find((project) => project.id === id)!.name} · Construction BOQ`
        : 'Construction BOQ',
    );
    setLines([]);
    setSelections({});
    setGenerator(null);
    setSelectedQuoteLines([]);
    setGenFloors([]);
    setGenCounts(null);
    setGenDesign(null);
    setRepeatFrom({});
    setOverrides({});
    setMessage('');
  }
  function startNew() {
    if (!newProjects.length) {
      setMessage(
        'Save a quotation for a project without a BOQ before creating a new one.',
      );
      return;
    }
    router.push('/dashboard/execution/boq/new');
  }
  function openDocument(document: Document) {
    setActive(document);
    setScreen('view');
    router.replace(
      `/dashboard/execution/boq?open=${encodeURIComponent(document.id)}`,
    );
    setTitle(document.title);
    setProjectId(document.project_id || '');
    setQuoteId(document.quotation_revision_id || '');
    setLines(document.document?.items || []);
    setSelections(document.document?.selections ?? {});
    setGenerator(document.document?.generator ?? null);
    setGenFloors(document.document?.generator?.floors ?? []);
    setGenCounts(document.document?.generator?.counts ?? null);
    setGenDesign(normalizeDesign(document.document?.generator?.design));
    setRepeatFrom(document.document?.generator?.repeatFrom ?? {});
    setOverrides(document.document?.generator?.overrides ?? {});
    setMessage('');
  }
  function generateFromQuote(live = false, edits = overrides) {
    if (!schedule || !quoteId) return;
    const result = generateQuotationBoq({
      details: schedule,
      settings,
      floors: floorsForGeneration,
      counts: countsForGeneration,
      design: genDesign,
    });
    const kept = lines.filter((line) => !line.origin);
    // A new BOQ must not invent column/footing/beam steel from company-grid
    // assumptions. Legacy documents are preserved until intentionally edited.
    const measuredOnly = !active || generator?.measuredOnly === true;
    const measuredDesign = normalizeDesign(genDesign);
    const measuredColumns = Boolean(measuredDesign?.columns.length);
    const measuredBeams = Boolean(measuredDesign?.beams.length);
    // A slab's bar diameters and spacing must come from the drawing, not
    // automatically from a company rule without an entered measurement.
    const measuredSlab = Boolean(
      measuredDesign?.settings?.slabMainDia &&
      measuredDesign?.settings?.slabDistDia &&
      measuredDesign?.settings?.slabThicknessIn,
    );
    const sourceLines = result.lines.filter((line) => {
      if (!measuredOnly) return true;
      if (
        [
          'quote-foundation',
          'quote-columns',
          'quote-pedestals',
          'quote-plinth-beam',
        ].includes(line.kind)
      )
        return measuredColumns;
      if (line.kind === 'quote-slab') return measuredBeams && measuredSlab;
      // Binding wire includes multiple structural stages in the legacy
      // calculator; never count wire from still-unmeasured members.
      if (line.kind === 'quote-binding-wire')
        return line.section === 'Foundation'
          ? measuredColumns
          : measuredColumns && measuredBeams && measuredSlab;
      return true;
    });
    // Quantities and rates edited on the takeoff survive regeneration.
    const generated = sourceLines.map((line) => ({
      ...line,
      outputs: line.outputs.map((output) => {
        const edit = edits[overrideKey(line, output)];
        return edit
          ? {
              ...output,
              ...(edit.quantity !== undefined
                ? { quantity: edit.quantity }
                : {}),
              ...(edit.rate !== undefined ? { rate: edit.rate } : {}),
              source:
                `Edited on the BOQ${output.source ? ` · ${output.source}` : ''}`.slice(
                  0,
                  300,
                ),
            }
          : output;
      }),
    }));
    setLines([...generated, ...kept]);
    // Brands named in the quotation's specifications, unless already chosen.
    const quoted = brandSelectionsFromQuote(schedule.sections, initialRates);
    setSelections((prior) => ({ ...quoted, ...prior }));
    setGenerator({
      revisionId: quoteId,
      generatedAt: new Date().toISOString(),
      settings: result.settings,
      counts: result.counts,
      floors: result.floors,
      design: result.design,
      overrides: edits,
      warnings: result.warnings,
      measuredOnly,
      repeatFrom,
    });
    // A live update keeps what is being typed; a full generate takes the
    // normalized floors and counts back.
    if (live) return;
    setGenFloors(result.floors);
    setGenCounts(result.counts);
    if (!title.trim() || title === 'Construction BOQ')
      setTitle(
        `${activeProject?.name ?? 'Project'} · Construction BOQ`.slice(0, 200),
      );
    setMessage(
      `${sourceLines.length} measured items generated from the quotation${kept.length ? `; ${kept.length} manual items kept` : ''}. Structural stages need drawing quantities before they appear.`,
    );
  }
  // A BOQ prepared from the quotation (floors, counts, drawing schedule) but
  // not generated yet is generated as soon as its quotation is available.
  // A new BOQ for a project with a floor-wise quotation is generated as
  // soon as the quotation is chosen, once per BOQ and quotation.
  const autoKey = `${active?.id ?? 'new'}:${quoteId}`;
  const [autoGenerated, setAutoGenerated] = useState('');
  const autoPrepared = generator
    ? generator.revisionId === quoteId
    : !active && Boolean(quoteId);
  // Until the first generation runs, the totals are not known yet (not ₹0).
  const calculating =
    autoGenerated !== autoKey &&
    lines.length === 0 &&
    Boolean(schedule) &&
    autoPrepared;
  useEffect(() => {
    const prepared = autoPrepared;
    if (autoGenerated === autoKey || lines.length > 0 || !schedule || !prepared)
      return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- One-time generation of a prepared or new BOQ.
    setAutoGenerated(autoKey);
    generateFromQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Runs once per BOQ and quotation.
  }, [schedule, generator, quoteId, lines.length, autoKey, autoGenerated]);
  // Changing a count, size, room or the drawing schedule updates a
  // generated BOQ straight away (manual items are kept).
  const liveKey = JSON.stringify([genFloors, genCounts, genDesign]);
  const [lastLiveKey, setLastLiveKey] = useState(liveKey);
  useEffect(() => {
    if (liveKey === lastLiveKey) return;
    const timer = window.setTimeout(() => {
      setLastLiveKey(liveKey);
      if (
        lines.some((line) => line.origin) &&
        generator?.revisionId === quoteId
      )
        generateFromQuote(true);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Runs when the generation inputs change.
  }, [liveKey]);
  function updateOutputQuantity(
    lineIndex: number,
    outputIndex: number,
    quantity: number,
  ) {
    const target = lines[lineIndex];
    const output = target?.outputs[outputIndex];
    if (target?.origin && output) {
      const key = overrideKey(target, output);
      const next = {
        ...overrides,
        [key]: {
          ...overrides[key],
          quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
        },
      };
      setOverrides(next);
      setGenerator((prior) => (prior ? { ...prior, overrides: next } : prior));
    }
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
  function updateOutputRate(
    lineIndex: number,
    outputIndex: number,
    rate: number,
  ) {
    const target = lines[lineIndex];
    const output = target?.outputs[outputIndex];
    if (target?.origin && output) {
      const key = overrideKey(target, output);
      const next = {
        ...overrides,
        [key]: {
          ...overrides[key],
          rate: Number.isFinite(rate) ? Math.max(0, rate) : 0,
        },
      };
      setOverrides(next);
      setGenerator((prior) => (prior ? { ...prior, overrides: next } : prior));
    }
    setLines((prior) =>
      prior.map((line, i) =>
        i === lineIndex
          ? {
              ...line,
              outputs: line.outputs.map((output, j) =>
                j === outputIndex
                  ? {
                      ...output,
                      rate: Number.isFinite(rate) ? Math.max(0, rate) : 0,
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
    setTyped({});
    setNewName(
      kind === 'surface'
        ? 'Internal plaster'
        : kind === 'manual'
          ? ''
          : BOQ_TEMPLATES.find((row) => row.kind === kind)?.label || '',
    );
  }
  function addLine() {
    if (schedule && selectedTemplate !== 'manual') {
      setMessage(
        'Quotation-generated BOQs already measure the structure and finishes. Use manual entries only for extra work.',
      );
      return;
    }
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
    if (
      schedule &&
      lines.some(
        (line) =>
          !line.origin &&
          [
            'excavation',
            'footing',
            'pedestal',
            'column',
            'plinth_beam',
            'beam',
            'slab',
            'wall',
            'surface',
          ].includes(line.kind),
      )
    ) {
      setMessage(
        'Remove overlapping manually measured structural or finishing items before saving. The quotation already generates these quantities.',
      );
      return;
    }
    if (
      !active &&
      (!newProjects.some((project) => project.id === projectId) ||
        !quoteForProject(projectId))
    ) {
      setMessage('Choose a new project with a saved quotation.');
      return;
    }
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
        currency: 'INR',
        items: lines,
        selections,
        ...(generator ? { generator: { ...generator, repeatFrom } } : {}),
      });
      if (!result.ok) {
        setMessage(result.message || 'Could not save BOQ.');
        return;
      }
      setMessage('BOQ saved.');
      setActive({
        id: result.id || active?.id || '',
        title,
        status: active?.status ?? 'draft',
        project_id: projectId || null,
        quotation_revision_id: quoteId || null,
        currency: 'INR',
        version: (active?.version || 0) + 1,
        document: {
          items: lines,
          selections,
          ...(generator ? { generator: { ...generator, repeatFrom } } : {}),
        },
        updated_at: new Date().toISOString(),
      });
      setScreen('view');
      router.replace(
        `/dashboard/execution/boq?open=${encodeURIComponent(result.id || active?.id || '')}`,
      );
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
      if (result.ok) {
        setActive(null);
        setScreen('view');
        router.replace('/dashboard/execution/boq');
      }
      router.refresh();
    });
  }

  // Floor repetition is a saved, explicit copy of the ground-floor setup.
  // Each floor keeps its own quoted dimensions; only counts, room schedules,
  // window schedules and named manual extras are reused.
  function updateStageCounts(next: BoqCounts, inheritance = repeatFrom) {
    const source = floorsForGeneration[0]?.name;
    if (!source) {
      setGenCounts(next);
      return;
    }
    const following = {
      ...next,
      floors: { ...next.floors },
      finishes: { ...next.finishes },
      windowSizes: { ...next.windowSizes },
    };
    for (const [target, from] of Object.entries(inheritance)) {
      const sourceCounts = following.floors[from];
      if (!sourceCounts || target === from) continue;
      following.floors[target] = { ...sourceCounts };
      if (following.finishes?.[from]) {
        following.finishes![target] = {
          ...following.finishes![from]!,
          rooms: following.finishes![from]!.rooms.map((room) => ({ ...room })),
        };
      }
      if (following.windowSizes?.[from] !== undefined)
        following.windowSizes![target] = following.windowSizes![from]!;
    }
    setGenCounts(following);
  }
  function repeatStageFloors(targets: string[], enabled: boolean) {
    const source = floorsForGeneration[0]?.name;
    if (!source) return;
    const validTargets = targets.filter(
      (floor) =>
        floor !== source &&
        floorsForGeneration.some((item) => item.name === floor),
    );
    if (!validTargets.length) return;
    const nextRepeat = { ...repeatFrom };
    for (const floor of validTargets) {
      if (enabled) nextRepeat[floor] = source;
      else delete nextRepeat[floor];
    }
    setRepeatFrom(nextRepeat);
    if (!enabled) return; // Copies remain editable when inheritance is disabled.
    updateStageCounts(countsForGeneration, nextRepeat);
    setGenDesign((prior) =>
      prior
        ? {
            ...prior,
            beams: prior.beams.map((beam) => ({
              ...beam,
              runFeet: floorsForGeneration.map((item, i) =>
                validTargets.includes(item.name)
                  ? (beam.runFeet[0] ?? 0)
                  : (beam.runFeet[i] ?? 0),
              ),
            })),
          }
        : null,
    );
    setLines((prior) => {
      const originals = prior.filter(
        (line) =>
          !line.origin && line.section === source && !line.inputs.repeatedFrom,
      );
      const retained = prior.filter(
        (line) =>
          !(
            validTargets.includes(line.section) &&
            line.inputs.repeatedFrom === source
          ),
      );
      return [
        ...retained,
        ...validTargets.flatMap((target) =>
          originals.map((line) => ({
            ...line,
            id: uid(),
            section: target,
            inputs: {
              ...line.inputs,
              repeatedFrom: source,
              sourceLineId: line.id,
            },
          })),
        ),
      ];
    });
  }
  function customizeStageFloor(floor: string) {
    setRepeatFrom((prior) => {
      const next = { ...prior };
      delete next[floor];
      return next;
    });
    setLines((prior) =>
      prior.map((line) =>
        line.section === floor && line.inputs.repeatedFrom
          ? { ...line, inputs: { ...line.inputs, repeatedFrom: '' } }
          : line,
      ),
    );
  }
  function addStageManual(
    stage: string,
    category: string,
    quantity: number,
    measureUnit: string,
    rate: number,
  ) {
    if (!(quantity > 0)) return;
    const label =
      (
        {
          excavation: 'Excavation',
          soil: 'Soil Filling',
          pcc: 'PCC Bed',
          footings: 'Footings',
          columns: 'Columns',
          plinth: 'Plinth Beam',
          compound: 'Compound Wall',
          beams: 'Beams',
          slab: 'Slab',
          staircase: 'Staircase',
          brickwork: 'Brickwork',
          plaster: 'Plastering',
          painting: 'Painting',
          tiles: 'Tiles',
          electrical: 'Electrical',
          plumbing: 'Plumbing',
          doors: 'Doors & Windows',
          parapet: 'Parapet Wall',
          waterproofing: 'Waterproofing',
        } as Record<string, string>
      )[category] ?? 'Additional work';
    const item: SavedLine = {
      id: uid(),
      name: label,
      section: stage,
      kind: 'manual',
      unit: measureUnit,
      inputs: { quantity, stageCategory: category },
      outputs: [{ name: label, quantity, unit: measureUnit, rate }],
      notes: '',
    };
    const copies = Object.entries(repeatFrom)
      .filter(([, from]) => from === stage)
      .map(([target, from]): SavedLine => ({
        ...item,
        id: uid(),
        section: target,
        inputs: { ...item.inputs, repeatedFrom: from, sourceLineId: item.id },
      }));
    setLines((prior) => [...prior, item, ...copies]);
    setMessage(
      label + ' added to ' + stage + '. Save BOQ to keep the measurement.',
    );
  }

  const oldManualStructural =
    schedule && generator
      ? lines.filter(
          (line) =>
            !line.origin &&
            [
              'excavation',
              'footing',
              'pedestal',
              'column',
              'plinth_beam',
              'beam',
              'slab',
              'wall',
              'surface',
            ].includes(line.kind),
        )
      : [];
  const stages = [...new Set(lines.map((line) => line.section || 'Other'))];
  function editDocument() {
    if (!active || !canEdit) return;
    setScreen('edit');
    router.replace(
      `/dashboard/execution/boq?open=${encodeURIComponent(active.id)}&mode=edit`,
    );
  }
  if (screen === 'view') {
    return (
      <main className="erp-page manual-boq boq-readonly">
        <div className="erp-titlebar">
          <div>
            <p className="erp-eyebrow">Construction takeoff</p>
            <h1>Saved BOQs</h1>
            <p>
              Review saved measurements, materials and costs. Edit only when
              changes are needed.
            </p>
          </div>
          {canCreate && newProjects.length > 0 && (
            <Link
              className="erp-button erp-button-primary"
              href="/dashboard/execution/boq/new"
            >
              ＋ New BOQ
            </Link>
          )}
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
                <span>{plural(documents.length, 'document', 'documents')}</span>
              </div>
              {canCreate && newProjects.length > 0 && (
                <Link
                  className="boq-add-small"
                  href="/dashboard/execution/boq/new"
                  aria-label="Create new BOQ"
                >
                  ＋
                </Link>
              )}
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
                      · View / Edit
                    </small>
                  </span>
                  <span className="boq-register-arrow">›</span>
                </button>
              ))
            ) : (
              <p className="boq-empty">No saved BOQs yet.</p>
            )}
            {canCreate && newProjects.length === 0 && (
              <p className="boq-empty">
                New BOQs require a project with a saved quotation and no
                existing BOQ.
              </p>
            )}
          </aside>
          <section className="boq-editor">
            {active ? (
              <>
                <div className="boq-panel-heading">
                  <div>
                    <h2>View BOQ</h2>
                    <span>
                      Revision {active.version} · Updated{' '}
                      {new Date(active.updated_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      className="erp-button erp-button-primary"
                      type="button"
                      onClick={editDocument}
                    >
                      Edit BOQ
                    </button>
                  )}
                </div>
                <h3 className="boq-view-title">{title}</h3>
                <div className="boq-view-fields">
                  <div>
                    <span>Project</span>
                    <strong>{activeProject?.name ?? 'Not linked'}</strong>
                  </div>
                  <div>
                    <span>Quotation</span>
                    <strong>
                      {currentQuote?.label ?? 'Saved quotation revision'}
                    </strong>
                  </div>
                </div>
                <div className="boq-metrics boq-editor-legacy-metrics">
                  <div>
                    <span>Estimated material + labour</span>
                    <strong>
                      {canViewCost ? money(materialCost) : 'Restricted'}
                    </strong>
                  </div>
                  <div>
                    <span>Quotation value</span>
                    <strong>{money(quotedValue)}</strong>
                  </div>
                  {canViewCost && quotedValue > 0 && (
                    <div>
                      <span>Estimated margin</span>
                      <strong>{money(margin)}</strong>
                    </div>
                  )}
                  <div>
                    <span>Measured items</span>
                    <strong>{lines.length}</strong>
                  </div>
                </div>
                {oldManualStructural.length > 0 && (
                  <p role="alert" className="boq-view-warning">
                    {oldManualStructural.length} older manual structural /
                    finishing entries may duplicate quantities already generated
                    from the quotation. Review these in Edit BOQ; existing data
                    has not been deleted.
                  </p>
                )}
                {generator?.warnings?.length ? (
                  <details className="boq-view-warnings">
                    <summary>
                      Drawing assumptions ({generator.warnings.length})
                    </summary>
                    <ul>
                      {generator.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {steelSummary.size > 0 && (
                  <section className="boq-view-steel">
                    <h3>Steel summary</h3>
                    <div className="boq-view-steel-grid">
                      {diameters.map((diameter) => (
                        <div key={diameter}>
                          <strong>{diameter} mm steel</strong>
                          <span>
                            {steelSummary
                              .get(diameter)
                              ?.rods.toLocaleString('en-IN')}{' '}
                            rods ·{' '}
                            {steelSummary
                              .get(diameter)
                              ?.kg.toLocaleString('en-IN', {
                                maximumFractionDigits: 1,
                              })}{' '}
                            kg
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <section className="boq-view-items">
                  <h3>Item-wise quantities by stage</h3>
                  {stages.map((stage) => {
                    const items = lines.filter(
                      (line) => (line.section || 'Other') === stage,
                    );
                    return (
                      <details className="boq-floor-cost" key={stage}>
                        <summary>
                          {stage} · {plural(items.length, 'item', 'items')}
                        </summary>
                        <div className="boq-view-table-scroll">
                          <table className="boq-view-table">
                            <thead>
                              <tr>
                                <th>Item / material</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                                {canViewCost && (
                                  <>
                                    <th>Rate</th>
                                    <th>Cost</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((line) => (
                                <Fragment key={line.id}>
                                  <tr className="boq-view-group">
                                    <td colSpan={canViewCost ? 5 : 3}>
                                      {line.name}
                                    </td>
                                  </tr>
                                  {line.outputs.map((output, i) => (
                                    <tr key={`${line.id}-${i}`}>
                                      <td>{output.name}</td>
                                      <td>
                                        {output.quantity.toLocaleString(
                                          'en-IN',
                                          { maximumFractionDigits: 3 },
                                        )}
                                      </td>
                                      <td>{output.unit}</td>
                                      {canViewCost && (
                                        <>
                                          <td>{rateMoney(priceOf(output))}</td>
                                          <td>
                                            {money(
                                              output.quantity * priceOf(output),
                                            )}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                  {!stages.length && (
                    <p className="boq-empty">No measured items saved.</p>
                  )}
                </section>
                <div className="boq-savebar">
                  <button
                    type="button"
                    className="erp-button"
                    onClick={downloadCsv}
                  >
                    Download Excel (CSV)
                  </button>
                  <button
                    type="button"
                    className="erp-button"
                    onClick={printBoq}
                  >
                    Print / PDF
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="erp-button erp-button-primary"
                      onClick={editDocument}
                    >
                      Edit BOQ
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="boq-view-empty">
                <h2>Select a BOQ</h2>
                <p>Open a saved BOQ to view its details.</p>
                {canCreate && newProjects.length > 0 && (
                  <Link
                    className="erp-button erp-button-primary"
                    href="/dashboard/execution/boq/new"
                  >
                    ＋ New BOQ
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="erp-page manual-boq boq-edit-page">
      <div className="erp-titlebar">
        <div>
          <p className="erp-eyebrow">Construction takeoff</p>
          <h1>{screen === 'new' ? 'Create new BOQ' : 'Edit BOQ'}</h1>
          <p>
            Measure work, calculate material quantities, and price labour and
            materials from your company rate list.
          </p>
        </div>
        <div className="erp-header-actions">
          <Link href="/dashboard/execution/boq" className="erp-button">
            ← Saved BOQs
          </Link>
          <div
            className="boq-unit-toggle"
            role="group"
            aria-label="Measurement units"
          >
            {(
              [
                ['m', 'Metres'],
                ['ft', 'Feet'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={unit === value}
                className={unit === value ? 'active' : ''}
                onClick={() => setUnit(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {canViewCost && canEdit && (
            <Link
              className="erp-button"
              href="/dashboard/execution/boq/pricing"
            >
              Configure rates
            </Link>
          )}
          {screen === 'edit' && canCreate && newProjects.length > 0 && (
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
          <strong>
            {!canViewCost
              ? 'Restricted'
              : calculating
                ? 'Calculating…'
                : money(materialCost)}
          </strong>
        </div>
        <div>
          <span>Quotation value (customer price)</span>
          <strong>{money(quotedValue)}</strong>
        </div>
        {canViewCost && quotedValue > 0 && (
          <div>
            <span>Margin over cost</span>
            <strong>
              {calculating
                ? 'Calculating…'
                : `${money(margin)} (${Math.round((margin / quotedValue) * 100)}%)`}
            </strong>
          </div>
        )}
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
      <div className="boq-layout boq-layout-full">
        <section className="boq-editor">
          <div className="boq-panel-heading">
            <div>
              <h2>{active ? 'Edit BOQ' : 'Create BOQ'}</h2>
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
          <BoqStageBuilder
            floors={floorsForGeneration}
            lines={lines}
            projectId={projectId}
            projects={projects.map((project) => ({
              id: project.id,
              name: project.name,
              eligible: newProjects.some((item) => item.id === project.id),
            }))}
            onProjectChange={selectProject}
            title={title}
            onTitleChange={setTitle}
            quoteLabel={currentQuote?.label ?? ''}
            design={genDesign}
            onDesignChange={setGenDesign}
            counts={countsForGeneration}
            onCountsChange={updateStageCounts}
            onFloorChange={setGenFloors}
            repeatFrom={repeatFrom}
            onRepeatFloors={repeatStageFloors}
            onCustomizeFloor={customizeStageFloor}
            onUpdateQuantity={updateOutputQuantity}
            onUpdateRate={updateOutputRate}
            rateFor={priceOf}
            onAddManual={addStageManual}
            onRemoveManual={(index) =>
              setLines((prior) => prior.filter((_, i) => i !== index))
            }
            onSave={save}
            onPrint={printBoq}
            onAdvanced={() => setShowAdvanced((prior) => !prior)}
            canViewCost={canViewCost}
            busy={busy}
            message={message}
            newDocument={!active}
          />
          {showAdvanced && (
            <div className="boq-advanced-content">
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
                    disabled={Boolean(active)}
                    onChange={(event) => selectProject(event.target.value)}
                    aria-describedby="boq-project-availability"
                  >
                    <option value="">Choose a project</option>
                    {projects.map((project) => {
                      const saved = documents.some(
                        (document) => document.project_id === project.id,
                      );
                      const ready = newProjects.some(
                        (item) => item.id === project.id,
                      );
                      const state = saved
                        ? 'saved'
                        : ready
                          ? 'new'
                          : 'needs-final';
                      return (
                        <option
                          key={project.id}
                          value={project.id}
                          disabled={!saved && !ready}
                        >
                          {boqProjectOptionLabel(project, state)}
                        </option>
                      );
                    })}
                  </select>
                  <small id="boq-project-availability">
                    All {projects.length} delivery projects are listed. Select a
                    saved BOQ to edit it. The newest saved quotation is Final by
                    default unless you manually select another.
                  </small>
                  <Link href="/dashboard/projects">View all projects</Link>
                </label>
                <div className="boq-quote-source">
                  <span>Quotation</span>
                  <strong>
                    {currentQuote
                      ? currentQuote.label
                      : quoteId
                        ? 'Earlier quotation revision'
                        : projectId
                          ? 'No saved quotation'
                          : newProjects.length
                            ? 'Choose a new project'
                            : 'No new BOQ projects'}
                  </strong>
                  <small>
                    {currentQuote
                      ? currentQuote.isFinal
                        ? "The project's Final quotation"
                        : 'This BOQ uses its previously saved quotation'
                      : quoteId
                        ? 'This BOQ was made from an earlier quotation revision'
                        : projectId
                          ? 'Save a quotation for this project in Quotations'
                          : newProjects.length
                            ? 'Latest saved quotation is Final unless manually overridden'
                            : 'Existing BOQs remain available on the left; new projects require a saved quotation.'}
                  </small>
                </div>
              </div>
              {currentQuote && currentQuote.lines.length > 0 && (
                <section className="boq-import">
                  <div className="boq-import-head">
                    <div>
                      <h3>Use quotation prices</h3>
                      <p>
                        Import selected quote lines with their saved quantity
                        and selling price. Quote prices stay separate from your
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
                        Enter room dimensions, openings, column groups, beam
                        lengths and reinforcement below from the drawings. Both
                        typed schedules and code-generated takeoffs run through
                        this same quotation BOQ engine. Steel is cut from{' '}
                        {settings.stockBarFeet} ft bars:{' '}
                        {settings.foundationCuts} pieces per bar for the
                        foundation lift and {settings.floorCuts} per bar for
                        each floor above, with a {settings.lapDiameters}d lap at
                        every floor. Package allowances (per door, per bathroom,
                        per sq ft) are priced at the quoted value. Manual items
                        are kept.
                      </p>
                    </div>
                    <button
                      className="erp-button erp-button-primary"
                      type="button"
                      onClick={() => generateFromQuote()}
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
                      <span>Parking (sqft)</span>
                    </div>
                    {floorsForGeneration.map((floor, floorIndex) => (
                      <div className="boq-gen-floor" key={floor.name}>
                        <strong>{floor.name}</strong>
                        <span>
                          {floor.areaSqft.toLocaleString('en-IN')} sqft
                        </span>
                        <span>
                          {floor.lengthFeet} × {floor.widthFeet}
                        </span>
                        <label>
                          <NumberField
                            feet
                            min={7}
                            max={20}
                            label={`${floor.name} floor height`}
                            value={floor.heightFeet}
                            onChange={(heightFeet) => {
                              setGenFloors(
                                floorsForGeneration.map((item, i) =>
                                  i === floorIndex
                                    ? {
                                        ...item,
                                        heightAssumed: false,
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
                        <label>
                          <NumberField
                            max={floor.areaSqft}
                            label={`${floor.name} parking area`}
                            value={floor.parkingSqft ?? 0}
                            onChange={(value) => {
                              const parkingSqft = Math.min(
                                floor.areaSqft,
                                Math.max(0, value),
                              );
                              setGenFloors(
                                floorsForGeneration.map((item, i) =>
                                  i === floorIndex
                                    ? { ...item, parkingSqft }
                                    : item,
                                ),
                              );
                            }}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <BoqFloorInputs
                    floors={floorsForGeneration}
                    counts={countsForGeneration}
                    defaults={settings}
                    onChange={setGenCounts}
                  />
                  <div className="boq-gen-counts">
                    <label>
                      Entrance gates
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={countsForGeneration.entranceGates}
                        onChange={(event) =>
                          setGenCounts({
                            ...countsForGeneration,
                            entranceGates: Math.max(
                              0,
                              Math.round(Number(event.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Compound wall (running ft, 0 = none)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={countsForGeneration.compoundWallFeet}
                        onChange={(event) =>
                          setGenCounts({
                            ...countsForGeneration,
                            compoundWallFeet: Math.max(
                              0,
                              Math.round(Number(event.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </label>
                    {canViewCost && canEdit && (
                      <Link
                        className="boq-gen-settings-link"
                        href="/dashboard/execution/boq/pricing"
                      >
                        Rules: column grid, bars, laps, parapet, tile &amp;
                        painting quantities →
                      </Link>
                    )}
                  </div>
                  <BoqDesignSchedule
                    design={genDesign}
                    floors={floorsForGeneration}
                    defaults={settings}
                    onChange={setGenDesign}
                  />
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
              {canViewCost && floorBreakdown.size > 0 && (
                <section className="boq-materials boq-floor-costs">
                  <div className="boq-steel-summary">
                    <h3>Cost estimate, floor by floor</h3>
                    <p className="boq-steel-note">
                      Estimated costs use today&apos;s selected material and
                      trade rates. Quoted allowance ceilings are displayed
                      separately; they are not supplier costs. Structural labour
                      uses the configured contract rate. Open a floor for
                      quantity × rate.
                    </p>
                    <table className="boq-floor-overview">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Built-up</th>
                          <th>Cost</th>
                          <th>Per sq ft</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...floorBreakdown.entries()].map(([stage, heads]) => {
                          const total = [...heads.values()].reduce(
                            (sum, head) => sum + head.amount,
                            0,
                          );
                          const area = floorArea.get(stage);
                          return (
                            <tr key={stage}>
                              <td>{stage}</td>
                              <td>
                                {area
                                  ? `${area.toLocaleString('en-IN')} sq ft`
                                  : '—'}
                              </td>
                              <td>{money(total)}</td>
                              <td>{area ? money(total / area) : '—'}</td>
                            </tr>
                          );
                        })}
                        <tr className="total">
                          <td>Total project cost</td>
                          <td>
                            {builtUpSqft > 0
                              ? `${builtUpSqft.toLocaleString('en-IN')} sq ft`
                              : ''}
                          </td>
                          <td>{money(materialCost)}</td>
                          <td>
                            {builtUpSqft > 0
                              ? money(materialCost / builtUpSqft)
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <h4 className="boq-floor-drill">
                      Quantity × rate — open a stage
                    </h4>
                    {[...floorBreakdown.entries()].map(([stage, heads]) => {
                      const rows = COST_HEADS.map(
                        (head) => [head, heads.get(head)] as const,
                      ).filter(
                        (entry): entry is readonly [CostHead, HeadTotal] =>
                          Boolean(entry[1] && entry[1].amount > 0),
                      );
                      const total = rows.reduce(
                        (sum, [, value]) => sum + value.amount,
                        0,
                      );
                      const area = floorArea.get(stage);
                      return (
                        <details key={stage} className="boq-floor-cost">
                          <summary>
                            <strong>{stage}</strong>
                            <span>
                              {money(total)}
                              {area ? ` · ${money(total / area)}/sq ft` : ''}
                            </span>
                          </summary>
                          <table>
                            <tbody>
                              {rows.map(([head, value]) => {
                                const parts = [...value.items.entries()].filter(
                                  ([, part]) => part.amount > 0,
                                );
                                // Labour of different trades (walls, plaster …)
                                // is not one quantity × rate.
                                const showQty =
                                  !value.mixed &&
                                  value.quantity > 0 &&
                                  (head in QUANTITY_HEADS ||
                                    (head === 'Structural labour' &&
                                      parts.length === 1));
                                return (
                                  <Fragment key={head}>
                                    <tr className="boq-head-row">
                                      <td>{head}</td>
                                      <td>
                                        {showQty
                                          ? `${value.quantity.toLocaleString(
                                              'en-IN',
                                              {
                                                maximumFractionDigits: 1,
                                              },
                                            )} ${value.unit} × ${rateMoney(
                                              value.amount / value.quantity,
                                            )}`
                                          : ''}
                                      </td>
                                      <td>{money(value.amount)}</td>
                                    </tr>
                                    {(!showQty || parts.length > 1) &&
                                      parts.length > 0 &&
                                      parts.map(([key, part]) => (
                                        <tr key={key} className="boq-item-row">
                                          <td>{key.split('::')[0]}</td>
                                          <td>
                                            {part.quantity.toLocaleString(
                                              'en-IN',
                                              {
                                                maximumFractionDigits: 1,
                                              },
                                            )}{' '}
                                            {part.unit} ×{' '}
                                            {money(part.amount / part.quantity)}
                                          </td>
                                          <td>{money(part.amount)}</td>
                                        </tr>
                                      ))}
                                  </Fragment>
                                );
                              })}
                              <tr className="total">
                                <td>{stage} total</td>
                                <td>
                                  {area
                                    ? `${money(total / area)} per sq ft`
                                    : ''}
                                </td>
                                <td>{money(total)}</td>
                              </tr>
                            </tbody>
                          </table>
                          {(floorOrders.get(stage)?.length ?? 0) > 0 && (
                            <ul className="boq-floor-orders">
                              {floorOrders.get(stage)!.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          )}
                        </details>
                      );
                    })}
                  </div>
                </section>
              )}
              <section className="boq-takeoff">
                <div className="boq-section-title">
                  <div>
                    <h3>Detailed takeoff</h3>
                    <p>
                      Every item with its dimensions, quantities and rate. Edit
                      a quantity or rate here; the floor-wise estimate updates.
                    </p>
                  </div>
                  <span className="boq-count-pill">{lines.length} items</span>
                  {Object.keys(overrides).length > 0 && (
                    <button
                      type="button"
                      className="erp-button erp-button-quiet"
                      title="Go back to the calculated quantities and rates"
                      onClick={() => {
                        setOverrides({});
                        generateFromQuote(true, {});
                      }}
                    >
                      Undo{' '}
                      {plural(Object.keys(overrides).length, 'edit', 'edits')}
                    </button>
                  )}
                  {lines.length > 0 && (
                    <button
                      type="button"
                      className="erp-button erp-button-quiet"
                      onClick={() => setShowTakeoff((open) => !open)}
                    >
                      {showTakeoff
                        ? 'Hide detailed takeoff'
                        : 'Show detailed takeoff'}
                    </button>
                  )}
                </div>
                {!lines.length ? (
                  <div className="boq-empty-takeoff">
                    <span>∑</span>
                    <strong>Your takeoff will appear here</strong>
                    <small>
                      Add a measured work item or import quote lines.
                    </small>
                  </div>
                ) : !showTakeoff ? null : (
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
                          {line.kind === 'quoted' &&
                          line.quotedPrice !== undefined
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
                              .map(([key, value]) => {
                                const kind = kindOf(line.kind, key);
                                return (
                                  <span key={key}>
                                    {key.replace(
                                      /[A-Z]/g,
                                      (letter) => ` ${letter.toLowerCase()}`,
                                    )}{' '}
                                    <b>
                                      {toDisplay(value, kind, unit)}
                                      {kind === 'len'
                                        ? ` ${unit}`
                                        : kind === 'area'
                                          ? unit === 'ft'
                                            ? ' sq ft'
                                            : ' m²'
                                          : kind === 'spacing'
                                            ? unit === 'ft'
                                              ? ' in'
                                              : ' mm'
                                            : ''}
                                    </b>
                                  </span>
                                );
                              })}
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
                                  {output.source && (
                                    <small>{output.source}</small>
                                  )}
                                  {output.order && (
                                    <small>To order: {output.order}</small>
                                  )}
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
                                    <span className="boq-rate-cell">
                                      {line.kind === 'quoted' ? (
                                        '—'
                                      ) : !canEdit ? (
                                        rateMoney(rate)
                                      ) : (
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          aria-label={`${output.name} cost rate`}
                                          value={output.rate ?? rate}
                                          onChange={(event) =>
                                            updateOutputRate(
                                              index,
                                              outputIndex,
                                              Number(event.target.value),
                                            )
                                          }
                                        />
                                      )}
                                      {output.quotedRate !== undefined && (
                                        <small>
                                          Quoted limit:{' '}
                                          {money(output.quotedRate)}/
                                          {output.unit} (not supplier cost)
                                        </small>
                                      )}
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
                            setLines((prior) =>
                              prior.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Remove item
                        </button>
                      </div>
                    </details>
                  ))
                )}
              </section>
              <section className="boq-add-work">
                <div className="boq-section-title">
                  <div>
                    <h3>{schedule ? 'Add extra work' : 'Add measured work'}</h3>
                    <p>
                      {schedule
                        ? 'Columns, footings, beams, slabs, masonry and finishes are already calculated from the structural drawing. Add only extra work not covered by the generated BOQ.'
                        : 'Choose a takeoff and enter the dimensions. Calculated quantities update as you type.'}
                    </p>
                  </div>
                </div>
                <div className="boq-template-row">
                  {(schedule
                    ? BOQ_TEMPLATES.filter(
                        (template) => template.kind === 'manual',
                      )
                    : BOQ_TEMPLATES
                  ).map((template) => (
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
                        (definition.key !== 'coats' &&
                          definition.key !== 'waste'),
                    )
                    .map((definition) => (
                      <label key={definition.key}>
                        {unitLabel(
                          definition.label,
                          fieldKind(definition),
                          unit,
                        )}
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
                            value={
                              typed[definition.key] ??
                              toDisplay(
                                inputs[definition.key] ?? definition.value,
                                fieldKind(definition),
                                unit,
                              )
                            }
                            onChange={(event) => {
                              const text = event.target.value;
                              const kind = fieldKind(definition);
                              if (kind && unit !== 'm')
                                setTyped((prior) => ({
                                  ...prior,
                                  [definition.key]: text,
                                }));
                              setInputs((prior) => ({
                                ...prior,
                                [definition.key]: toMetric(text, kind, unit),
                              }));
                            }}
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
                              coats:
                                surfaceType === 'Internal paint' ? '2' : '1',
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
                      placeholder={
                        schedule
                          ? 'e.g. Extra labour or material'
                          : 'e.g. Ground floor C1–C5 columns'
                      }
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
              {(usedMaterials.size > 0 || steelSummary.size > 0) && (
                <section className="boq-materials">
                  {canViewCost && (
                    <div className="boq-brand-picks">
                      <h3>Brand &amp; source for this BOQ</h3>
                      <div>
                        {brandPicks.map((pick) => (
                          <label key={pick.key}>
                            {pick.label}
                            <select
                              value={
                                selections[pick.key] ??
                                pick.options[0]?.variant ??
                                ''
                              }
                              onChange={(event) =>
                                setSelections((prior) => ({
                                  ...prior,
                                  [pick.key]: event.target.value,
                                }))
                              }
                              disabled={!pick.options.length}
                            >
                              {!pick.options.length && (
                                <option value="">Set rates first</option>
                              )}
                              {pick.options.map((option) => (
                                <option key={option.key} value={option.variant}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                        {!brandPicks.length && (
                          <p className="boq-steel-note">
                            Add more than one brand or source to a material in
                            Configure rates to choose here.
                          </p>
                        )}
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
              {orderList.length > 0 && (
                <section className="boq-materials boq-order-list">
                  <div className="boq-steel-summary">
                    <h3>Materials &amp; work to order, whole project</h3>
                    <p className="boq-steel-note">
                      Every stage added up: what to buy for the full building,
                      and which stages need it.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Material / work</th>
                          <th>Quantity</th>
                          {canViewCost && <th>Amount</th>}
                          <th>Stages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderList.map((line, index) => (
                          <Fragment key={`${line.name}::${line.unit}`}>
                            {(index === 0 ||
                              orderList[index - 1]!.head !== line.head) && (
                              <tr className="boq-head-row">
                                <td colSpan={canViewCost ? 4 : 3}>
                                  {line.head}
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td>{line.name}</td>
                              <td>
                                {line.quantity.toLocaleString('en-IN', {
                                  maximumFractionDigits: 2,
                                })}{' '}
                                {line.unit}
                                {line.weightKg > 0 && line.unit !== 'kg'
                                  ? ` · ${tonnes(line.weightKg)} t`
                                  : ''}
                              </td>
                              {canViewCost && <td>{money(line.amount)}</td>}
                              <td>{line.stages.join(', ')}</td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                  <span>Quotation value (customer price)</span>
                  <strong>{money(quotedValue)}</strong>
                </div>
                {canViewCost && quotedValue > 0 && (
                  <div>
                    <span>Margin over cost</span>
                    <strong>{money(margin)}</strong>
                  </div>
                )}
              </section>
              <div className="boq-savebar">
                <span>
                  {message ||
                    (active ? `Revision ${active.version}` : 'Unsaved BOQ')}
                </span>
                {lines.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="erp-button"
                      onClick={downloadCsv}
                      title="Download the BOQ for Excel / Google Sheets"
                    >
                      Download Excel (CSV)
                    </button>
                    <button
                      type="button"
                      className="erp-button"
                      onClick={printBoq}
                      title="Print the BOQ or save it as PDF"
                    >
                      Print / PDF
                    </button>
                  </>
                )}
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
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
