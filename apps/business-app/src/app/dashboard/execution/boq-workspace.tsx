'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type BoqInputs } from './boq-calculations';
import { removeManualBoq, saveManualBoq } from './boq-actions';
import { type LengthUnit } from './boq-units';
import {
  diameterOf,
  materialForOutput,
  brandSelectionsFromQuote,
  quotedRateVariants,
  QUOTE_SELECTIONS_KEY,
  quoteSyncMarker,
  rateForOutput,
  isBoqCostUnpriced,
  rateGroupKey,
  COST_HEADS,
  costHead,
  type Rate,
} from './boq-pricing';
import {
  measuredCounts,
  normalizeCounts,
  floorsFromQuote,
  generateQuotationBoq,
  normalizeStructuralSettings,
  normalizeDesign,
  parseBars,
  type BoqCounts,
  type BoqFloor,
  type StructuralDesign,
} from '@business-os/core/construction-boq';
import { BoqStageBuilder } from './boq-stage-builder';
import { BoqRegisterLanding } from './boq-register-landing';
import { BoqCreateStep } from './boq-create-step';
import {
  buildFloorPricing,
  BoqFinalFloorPricing,
} from './boq-final-floor-pricing';
import { validateBoqMeasurements } from './boq-save-validation';
import { BoqLabourPanel } from './boq-labour-panel';
import {
  DEFAULT_LABOUR,
  LEGACY_CIVIL_LABOUR_MATERIALS,
  isEmbeddedLabourCovered,
  evaluateLabour,
  labourMeasurements,
  labourExtraQuantity,
  labourWorkName,
  type LabourConfig,
} from './boq-labour';
import {
  measuredOutputs,
  correctSavedSmallConcrete,
  fillingOutput,
  type MeasuredDimensions,
  type MeasuredKind,
} from './boq-stage-measurements';
import { boqCsv, boqFileName, type BoqExportRow } from './boq-export';
import { costSummaryByHead } from './boq-cost-summary';
import {
  DEFAULT_BOQ_PROJECT_COSTS,
  normalizeBoqProjectCosts,
  type BoqProjectCosts,
} from './boq-project-costs';
import type { SftEstimateDetails } from '@business-os/core/sft-quotation';
import {
  clearDerivedPlasterQuantityOverrides,
  isAutoPlasterQuantity,
} from './boq-plaster-guards';
import { type BoqScopeReviews } from './boq-scope-coverage';

type Generator = {
  revisionId: string;
  generatedAt: string;
  settings: Record<string, number>;
  /** Optional per-BOQ RMC rate; if absent use the selected material rate card. */
  rmcRatePerM3?: number;
  counts: BoqCounts;
  floors: BoqFloor[];
  design?: StructuralDesign | null;
  /** Quantities / rates edited on generated lines, kept on regenerate. */
  overrides?: Record<string, { quantity?: number; rate?: number }>;
  warnings: string[];
  measuredOnly?: boolean;
  legacyCountsNeedReview?: boolean;
  repeatFrom?: Record<string, string>;
  /** Generator version that produced the lines (see BOQ_ENGINE_VERSION). */
  engineVersion?: number;
};
/** Bump when the quotation generator adds or reprices generated lines, so
 * saved BOQs regenerate once on edit (manual items and edits are kept). */
const BOQ_ENGINE_VERSION = 3;
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
    labour?: LabourConfig;
    projectCosts?: BoqProjectCosts;
    scopeReviews?: BoqScopeReviews;
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
const upgradeOldSmallConcrete = (
  items: SavedLine[],
  settings: ReturnType<typeof normalizeStructuralSettings>,
): SavedLine[] =>
  items.map((line) => {
    const outputs = (
      correctSavedSmallConcrete(line, settings) ?? line.outputs
    ).map((output) => fillingOutput(line.name, output));
    return { ...line, outputs };
  });

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
  rates: savedRates,
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
  const [showSavedDetails, setShowSavedDetails] = useState(
    Boolean(
      initialOpenId ||
      (initialProjectId && initialDocument?.project_id === initialProjectId),
    ),
  );
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
  const [lines, setLines] = useState<SavedLine[]>(() =>
    upgradeOldSmallConcrete(
      initialDocument?.document?.items ?? [],
      normalizeStructuralSettings(structural),
    ),
  );
  const [selections, setSelections] = useState<Record<string, string>>(
    initialDocument?.document?.selections ?? {},
  );
  // Older saved BOQs keep their old rates until labour costing is enabled.
  const [labour, setLabour] = useState<LabourConfig | null>(
    initialDocument
      ? (initialDocument.document?.labour ?? null)
      : { ...DEFAULT_LABOUR },
  );
  const [projectCosts, setProjectCosts] = useState<BoqProjectCosts>(
    normalizeBoqProjectCosts(initialDocument?.document?.projectCosts),
  );
  const [scopeReviews, setScopeReviews] = useState<BoqScopeReviews>(
    initialDocument?.document?.scopeReviews ?? {},
  );
  const [rmcEnabled, setRmcEnabled] = useState(() => {
    const saved =
      initialDocument?.document?.generator?.settings?.readyMixConcrete;
    return (
      (saved ?? normalizeStructuralSettings(structural).readyMixConcrete) !== 0
    );
  });
  const [rmcRateOverride, setRmcRateOverride] = useState<number | null>(
    initialDocument?.document?.generator?.rmcRatePerM3 ?? null,
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
  // Rate options the selected quotation adds: its purchase allowances and
  // brands it names that the company rate card does not list yet.
  const quoteSections = quotes.find((quote) => quote.id === quoteId)?.schedule
    ?.sections;
  const initialRates = useMemo(
    () => [...savedRates, ...quotedRateVariants(quoteSections, savedRates)],
    [savedRates, quoteSections],
  );
  const [unit, setUnitState] = useState<LengthUnit>(defaultUnit);
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
    try {
      window.localStorage.setItem('boq-length-unit', next);
    } catch {
      // Storage unavailable: the choice lasts for this visit.
    }
  }
  const [message, setMessage] = useState('');
  const [createError, setCreateError] = useState('');
  const [autoSaveState, setAutoSaveState] = useState<
    'saved' | 'saving' | 'error'
  >('saved');
  const [autoSaveError, setAutoSaveError] = useState('');
  const [retryAutoSave, setRetryAutoSave] = useState(0);
  const [autoSaveCycle, setAutoSaveCycle] = useState(0);
  const autoSavedDocId = useRef<string | null>(null);
  const autoSavedFingerprint = useRef<string | null>(null);
  const autoFailedFingerprint = useRef<string | null>(null);
  const lastFailedRetry = useRef(-1);
  const latestFingerprint = useRef<string | null>(null);
  const autoSaveVersion = useRef<number | null>(null);
  const autoSaving = useRef(false);
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const settings = useMemo(
    () => normalizeStructuralSettings(structural),
    [structural],
  );
  const concreteSettings = useMemo(
    () => ({ ...settings, readyMixConcrete: rmcEnabled ? 1 : 0 }),
    [settings, rmcEnabled],
  );
  const rmcRatePerM3 =
    rmcRateOverride ??
    rateForOutput(
      {
        name: 'M20 concrete (ready-mix)',
        material: 'concrete_m20',
        unit: 'm³',
      },
      initialRates,
      selections,
    );
  const labourGroups = new Set(
    initialRates
      .filter((rate) => rate.category === 'labour')
      .map((rate) => rate.material)
      .filter((value): value is string => Boolean(value)),
  );
  const isLabourOutput = (output: SavedLine['outputs'][number]) => {
    const group = materialForOutput(output);
    return Boolean(
      group &&
      (labourGroups.has(group) || LEGACY_CIVIL_LABOUR_MATERIALS.has(group)),
    );
  };
  const isOldLabour = (output: SavedLine['outputs'][number]) =>
    isEmbeddedLabourCovered(materialForOutput(output), labour);
  const priceOf = (output: SavedLine['outputs'][number]) =>
    // Reference-only concrete volume must never acquire a price from either
    // the material rate card or an old manual rate edit.
    (output.unit === 'm³' && output.name.endsWith(' · volume only')) ||
    (labour && isOldLabour(output))
      ? 0
      : rateForOutput(output, initialRates, selections);
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
    measuredCounts(floorsForGeneration),
    true,
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
  const diameters = [...steelSummary.keys()].sort((a, b) => a - b);
  const activeProject = projects.find((project) => project.id === projectId);
  const allOutputs = lines.flatMap((line) =>
    line.outputs.map((output) => ({
      ...output,
      lineId: line.id,
      lineName: line.name,
      kind: line.kind,
      rate: priceOf(output),
      section: line.section,
    })),
  );

  const materialOnlyCost = allOutputs.reduce(
    (sum, output) =>
      sum + (isLabourOutput(output) ? 0 : output.quantity * output.rate),
    0,
  );
  // Embedded trade labour remains payable unless the selected labour method
  // explicitly replaces it. Previously all trades were suppressed on any
  // new composite labour BOQ, understating the full construction cost.
  const legacyLabourCost = allOutputs.reduce(
    (sum, output) =>
      sum + (isLabourOutput(output) ? output.quantity * output.rate : 0),
    0,
  );
  const unpricedOutputs = allOutputs.filter(
    (output) => !isOldLabour(output) && isBoqCostUnpriced(output, priceOf),
  );
  const measuredLabour = labourMeasurements(lines);
  const labourEstimate = evaluateLabour(
    labour,
    floorsForGeneration,
    measuredLabour,
  );
  const labourCost = legacyLabourCost + labourEstimate.total;
  // The BOQ is material quantities + their landed rates + labour.
  // Historical project-wide expense fields remain archived on saved documents
  // but no longer inflate the measured construction BOQ.
  const materialCost = materialOnlyCost + labourCost;
  // Every quantity with its stage and cost head, for the order list and
  // the download.
  const materialExportRows: BoqExportRow[] = allOutputs.map((row) => {
    const material = materialForOutput(row);
    return {
      stage: row.section,
      item: row.lineName,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      rate: canViewCost ? row.rate : 0,
      head: isLabourOutput(row)
        ? 'Labour'
        : costHead(
            material ? rateGroupKey(material, diameterOf(row)) : undefined,
          ),
      order: row.order,
      weightKg: row.weightKg,
    };
  });
  // Whole-BOQ cost per material (steel, cement, sand …) and the trade labour
  // the composite package does not cover (tiling, painting, electrical …).
  const materialSummary = costSummaryByHead(
    materialExportRows.filter((row) => row.head !== 'Labour'),
  );
  const tradeLabourSummary = costSummaryByHead(
    allOutputs
      .filter((output) => isLabourOutput(output) && output.rate > 0)
      .map((output) => {
        const material = materialForOutput(output);
        return {
          head: material
            ? costHead(rateGroupKey(material, diameterOf(output)))
            : 'Other',
          quantity: output.quantity,
          unit: output.unit,
          rate: output.rate,
        };
      }),
  );
  const labourExportRows: BoqExportRow[] = !labour
    ? []
    : [
        ...(labour.method === 'composite'
          ? [
              {
                stage: 'Labour costing',
                item: labour.packageName,
                name: labour.packageName + ' · composite labour',
                quantity:
                  labour.areaOverrideSqft ??
                  floorsForGeneration.reduce((sum, f) => sum + f.areaSqft, 0),
                unit: 'sft',
                rate: labour.rate,
                head: 'Labour',
              },
            ]
          : labour.method === 'itemwise'
            ? measuredLabour.map((measured) => ({
                stage: measured.stage,
                item: labourWorkName(measured.work),
                name: labourWorkName(measured.work) + ' labour',
                quantity: measured.quantity,
                unit: measured.unit,
                rate: labour.itemRates[measured.work] ?? 0,
                head: 'Labour',
              }))
            : labour.dailyRates.map((worker) => ({
                stage: 'Labour costing',
                item: worker.name,
                name: worker.name + ' · daily estimate',
                quantity: worker.workers * worker.days,
                unit: 'worker-day',
                rate: worker.rate,
                head: 'Labour',
              }))),
        ...labour.extras.map((extra) => ({
          stage: extra.stage,
          item: extra.name,
          name:
            extra.name + (extra.outsideScope ? ' (extra beyond package)' : ''),
          quantity:
            extra.method === 'daily'
              ? extra.workers * extra.days
              : labourExtraQuantity(extra, measuredLabour),
          unit: extra.method === 'daily' ? 'worker-day' : extra.unit,
          rate: extra.rate,
          head: 'Labour',
        })),
      ];
  const exportRows = [...materialExportRows, ...labourExportRows];
  const builtUpSqft = floorsForGeneration.reduce(
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
      .querySelectorAll<HTMLDetailsElement>(
        '.boq-floor-cost, .boq-scope-review',
      )
      .forEach((element) => (element.open = true));
    window.print();
  }
  function selectProject(id: string) {
    if (id === projectId) return;
    setCreateError('');
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
    setLabour({ ...DEFAULT_LABOUR });
    setProjectCosts({ ...DEFAULT_BOQ_PROJECT_COSTS });
    setScopeReviews({});
    setRmcEnabled(settings.readyMixConcrete !== 0);
    setRmcRateOverride(null);
    setGenerator(null);
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
  function openDocument(document: Document, mode: 'view' | 'edit' = 'view') {
    setAutoSaveState('saved');
    setAutoSaveError('');
    setActive(document);
    setScreen(mode);
    setShowSavedDetails(mode === 'view');
    router.replace(
      `/dashboard/execution/boq?open=${encodeURIComponent(document.id)}${mode === 'edit' ? '&mode=edit' : ''}`,
    );
    setTitle(document.title);
    setProjectId(document.project_id || '');
    setQuoteId(document.quotation_revision_id || '');
    setLines(upgradeOldSmallConcrete(document.document?.items || [], settings));
    setSelections(document.document?.selections ?? {});
    setLabour(document.document?.labour ?? null);
    setProjectCosts(normalizeBoqProjectCosts(document.document?.projectCosts));
    setScopeReviews(document.document?.scopeReviews ?? {});
    setRmcEnabled(
      (document.document?.generator?.settings?.readyMixConcrete ??
        settings.readyMixConcrete) !== 0,
    );
    setRmcRateOverride(document.document?.generator?.rmcRatePerM3 ?? null);
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
    const measuredOnly = !active || generator?.measuredOnly === true;
    const legacyCountsNeedReview = Boolean(
      generator?.legacyCountsNeedReview ||
      (active &&
        generator &&
        (generator.engineVersion ?? 1) < BOQ_ENGINE_VERSION),
    );
    const result = generateQuotationBoq({
      details: schedule,
      settings: concreteSettings,
      floors: floorsForGeneration,
      counts: countsForGeneration,
      design: genDesign,
      splitBeamSlab: measuredOnly,
      measuredFinishes: true,
      requireConfirmedCounts: legacyCountsNeedReview,
    });
    const kept = upgradeOldSmallConcrete(
      lines.filter((line) => !line.origin),
      concreteSettings,
    );
    // A new BOQ must not invent column/footing/beam steel from company-grid
    // assumptions. Legacy documents are preserved until intentionally edited.
    const measuredDesign = normalizeDesign(genDesign);
    const measuredColumns = Boolean(
      measuredDesign?.columns.some(
        (col) => col.count > 0 && parseBars(col.bars).length > 0,
      ),
    );
    const measuredFootings = Boolean(measuredDesign?.footings.length);
    const measuredBeams = Boolean(
      measuredDesign?.beams.some(
        (beam) =>
          parseBars(beam.bars).length > 0 &&
          beam.runFeet.some((run) => run > 0),
      ),
    );
    // A slab's bar diameters and spacing must come from the drawing, not
    // automatically from a company rule without an entered measurement.
    const measuredSlab = Boolean(
      measuredDesign?.settings?.slabMainDia &&
      measuredDesign?.settings?.slabDistDia &&
      measuredDesign?.settings?.slabThicknessIn,
    );
    const sourceLines = result.lines.filter((line) => {
      // An older BOQ may already contain a manually measured chajja on this
      // floor. Preserve it and do not additionally bill auto window shades.
      if (line.kind === 'quote-window-sajjas')
        return !kept.some(
          (saved) =>
            saved.section === line.section &&
            saved.kind === 'measured-geometry' &&
            saved.inputs.stageCategory === 'sajjas',
        );
      if (!measuredOnly) return true;
      if (line.kind === 'quote-footings' || line.kind === 'quote-pedestals')
        return measuredFootings;
      if (line.kind === 'quote-columns') return measuredColumns;
      if (line.kind === 'quote-foundation')
        return Boolean(measuredDesign?.legacyFootings);
      if (measuredOnly && ['quote-excavation', 'quote-pcc'].includes(line.kind))
        return false;
      // No provisional brick counts in measured BOQs: walls are quantified
      // only after lengths, heights, thickness and openings are entered.
      if (
        measuredOnly &&
        line.kind === 'quote-masonry' &&
        !countsForGeneration.walls?.[line.section]?.length
      )
        return false;
      if (line.kind === 'quote-plinth-beam')
        return Boolean(
          measuredDesign?.plinthBeams?.length
            ? measuredDesign.plinthBeams.some(
                (beam) =>
                  beam.count > 0 &&
                  beam.lengthFeet > 0 &&
                  parseBars(beam.bars).length > 0,
              )
            : measuredDesign?.plinthRunFeet,
        );
      if (line.kind === 'quote-beams') return measuredBeams;
      if (line.kind === 'quote-slab') {
        const panels = measuredDesign?.slabPanels?.filter(
          (panel) => panel.floor === line.section,
        );
        if (panels?.length)
          return panels.some(
            (panel) =>
              panel.count > 0 &&
              panel.lengthFeet > 0 &&
              panel.widthFeet > 0 &&
              panel.thicknessIn > 0,
          );
        return measuredSlab;
      }
      if (line.kind === 'quote-staircase') {
        const stairs = measuredDesign?.staircases?.filter(
          (stair) => stair.floor === line.section,
        );
        if (stairs?.length)
          return stairs.some(
            (stair) =>
              stair.count > 0 &&
              stair.widthFeet > 0 &&
              stair.riserIn > 0 &&
              stair.treadIn > 0 &&
              stair.waistIn > 0,
          );
      }
      // Binding wire includes multiple structural stages in the legacy
      // calculator; never count wire from still-unmeasured members.
      if (line.kind === 'quote-binding-wire')
        return line.section === 'Foundation'
          ? measuredFootings && measuredColumns
          : measuredColumns && measuredBeams && measuredSlab;
      return true;
    });
    // Recomputed plaster materials may not keep stale quantity edits; all
    // other takeoff overrides, including prices, remain unchanged.
    const cleanEdits = clearDerivedPlasterQuantityOverrides(sourceLines, edits);
    if (cleanEdits !== edits) setOverrides(cleanEdits);
    // Quantities and rates edited on the takeoff survive regeneration.
    const generated = sourceLines.map((line) => ({
      ...line,
      outputs: line.outputs.map((output) => {
        const edit = cleanEdits[overrideKey(line, output)];
        const lockedPlaster = isAutoPlasterQuantity(line.kind, output.name);
        const measured = edit
          ? {
              ...output,
              ...(edit.quantity !== undefined && !lockedPlaster
                ? { quantity: edit.quantity }
                : {}),
              ...(edit.rate !== undefined ? { rate: edit.rate } : {}),
              source:
                `${lockedPlaster ? 'Auto-measured from walls' : 'Edited on the BOQ'}${output.source ? ` · ${output.source}` : ''}`.slice(
                  0,
                  300,
                ),
            }
          : output;
        // One RMC rate for all structural members; never apply it to manually
        // measured PCC, sajjas, shelves, brickwork or other non-RCC work.
        if (output.unit === 'm³' && output.name.endsWith(' · volume only'))
          return { ...measured, rate: 0 };
        return output.material === 'concrete_m20' && rmcRateOverride !== null
          ? { ...measured, rate: rmcRateOverride }
          : measured;
      }),
    }));
    setLines([...generated, ...kept]);
    // Brands named in the quotation's specifications, unless already chosen.
    const quoted = brandSelectionsFromQuote(schedule.sections, initialRates);
    setSelections((prior) =>
      prior[QUOTE_SELECTIONS_KEY] === quoteSyncMarker(quoteId)
        ? { ...quoted, ...prior }
        : {
            ...prior,
            ...quoted,
            [QUOTE_SELECTIONS_KEY]: quoteSyncMarker(quoteId),
          },
    );
    setGenerator({
      revisionId: quoteId,
      generatedAt: new Date().toISOString(),
      settings: result.settings,
      ...(rmcRateOverride !== null ? { rmcRatePerM3: rmcRateOverride } : {}),
      counts: result.counts,
      floors: result.floors,
      design: result.design,
      overrides: cleanEdits,
      warnings: result.warnings,
      measuredOnly,
      legacyCountsNeedReview,
      repeatFrom,
      engineVersion: BOQ_ENGINE_VERSION,
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
    setMessage('BOQ updated');
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
  // The quotation's brands and allowances price the BOQ once per quotation
  // revision; a later change on the rate card is kept.
  useEffect(() => {
    if (!canEdit || !quoteId || !quoteSections?.length) return;
    if (selections[QUOTE_SELECTIONS_KEY] === quoteSyncMarker(quoteId)) return;
    const quoted = brandSelectionsFromQuote(quoteSections, initialRates);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- One-time sync of quotation brands per revision.
    setSelections((prior) => ({
      ...prior,
      ...quoted,
      [QUOTE_SELECTIONS_KEY]: quoteSyncMarker(quoteId),
    }));
  }, [canEdit, quoteId, quoteSections, initialRates, selections]);
  // Correct older saved BOQs where the previous "Remove from floor"
  // control set calculated plaster material quantities to zero. They are
  // now derived from measured walls and refreshed once on opening.
  const refreshedPlasterDocument = useRef<string | null>(null);
  useEffect(() => {
    if (!active?.id || !generator || !schedule) return;
    if (refreshedPlasterDocument.current === active.id) return;
    const documentId = active.id;
    const needsRepair = lines.some(
      (line) =>
        line.kind === 'quote-masonry' &&
        Boolean(generator.counts.walls?.[line.section]?.length) &&
        line.outputs.some(
          (output) =>
            isAutoPlasterQuantity(line.kind, output.name) &&
            output.quantity === 0,
        ),
    );
    if (needsRepair) {
      const timer = window.setTimeout(() => {
        if (refreshedPlasterDocument.current !== documentId) {
          refreshedPlasterDocument.current = documentId;
          generateFromQuote(true);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    refreshedPlasterDocument.current = documentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- One-time recovery per saved document.
  }, [active?.id, generator?.revisionId, schedule]);
  // A saved BOQ generated by an older generator picks up new generated lines
  // (scaffolding, site services, internal-wall estimates …) once on edit.
  const upgradedDocument = useRef<string | null>(null);
  useEffect(() => {
    if (!active?.id || !generator || !schedule || !canEdit) return;
    if (screen !== 'edit' || upgradedDocument.current === active.id) return;
    if ((generator.engineVersion ?? 1) >= BOQ_ENGINE_VERSION) return;
    if (generator.revisionId !== quoteId) return;
    const timer = window.setTimeout(() => {
      upgradedDocument.current = active.id;
      generateFromQuote(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- One-time upgrade per saved document.
  }, [active?.id, generator?.revisionId, schedule, screen, canEdit]);
  // Changing a count, size, room or the drawing schedule updates a
  // generated BOQ straight away (manual items are kept).
  const liveKey = JSON.stringify([
    genFloors,
    genCounts,
    genDesign,
    rmcEnabled,
    rmcRateOverride,
  ]);
  const [lastLiveKey, setLastLiveKey] = useState(liveKey);
  useEffect(() => {
    if (liveKey === lastLiveKey) return;
    const timer = window.setTimeout(() => {
      setLastLiveKey(liveKey);
      // New BOQs may begin with no generated structural lines. Generate
      // again when the first column, beam or slab measurement is entered.
      if (
        generator?.revisionId === quoteId &&
        (lines.some((line) => line.origin) || generator.measuredOnly === true)
      )
        generateFromQuote(true);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Runs when the generation inputs change.
  }, [liveKey]);
  // The Continue action creates the BOQ first. All subsequent edits are
  // debounced and saved against that one stable document/revision. Never
  // auto-create a second BOQ or save before the initial setup is confirmed.
  const autoSaveContent = useMemo(
    () => ({
      title,
      projectId: projectId || null,
      quotationRevisionId: quoteId || null,
      currency: 'INR',
      items: lines,
      selections,
      ...(labour && canViewCost ? { labour } : {}),
      ...(canViewCost ? { projectCosts } : {}),
      scopeReviews,
      ...(generator ? { generator: { ...generator, repeatFrom } } : {}),
      ...(canViewCost ? { costSummary: materialSummary } : {}),
    }),
    [
      materialSummary,
      title,
      projectId,
      quoteId,
      lines,
      selections,
      labour,
      projectCosts,
      scopeReviews,
      canViewCost,
      generator,
      repeatFrom,
    ],
  );
  const autoSaveFingerprint = JSON.stringify(autoSaveContent);
  useEffect(() => {
    latestFingerprint.current = autoSaveFingerprint;
  }, [autoSaveFingerprint]);
  useEffect(() => {
    if (screen !== 'edit' || !active?.id || !canEdit) return;
    const documentId = active.id;
    // On first opening an existing BOQ, the current fields are the baseline.
    // In particular, entering Edit must never increment its revision.
    if (autoSavedDocId.current !== documentId) {
      autoSavedDocId.current = documentId;
      autoSaveVersion.current = active.version;
      autoSavedFingerprint.current = autoSaveFingerprint;
      autoFailedFingerprint.current = null;
      return;
    }
    if (autoSaveFingerprint === autoSavedFingerprint.current) return;
    // Wait for the 350 ms quotation/drawing regeneration to complete first.
    if (liveKey !== lastLiveKey || calculating) return;
    // A rejected save is not retried indefinitely. A new edit or explicit
    // Retry will attempt saving again while preserving unsaved field values.
    if (
      autoFailedFingerprint.current === autoSaveFingerprint &&
      lastFailedRetry.current === retryAutoSave
    )
      return;
    const timer = window.setTimeout(() => {
      if (autoSaving.current) return;
      const measurementError = validateBoqMeasurements(
        autoSaveContent.items,
        Boolean(schedule),
      );
      if (measurementError) {
        autoFailedFingerprint.current = autoSaveFingerprint;
        lastFailedRetry.current = retryAutoSave;
        setAutoSaveError(measurementError);
        setAutoSaveState('error');
        return;
      }
      const version = autoSaveVersion.current ?? active.version;
      autoSaving.current = true;
      setAutoSaveState('saving');
      void saveManualBoq({
        id: documentId,
        version,
        ...autoSaveContent,
      })
        .then((result) => {
          if (autoSavedDocId.current !== documentId) return;
          if (!result.ok) {
            autoFailedFingerprint.current = autoSaveFingerprint;
            lastFailedRetry.current = retryAutoSave;
            setAutoSaveError(result.message || 'Could not save the BOQ.');
            setAutoSaveState('error');
            return;
          }
          autoSavedFingerprint.current = autoSaveFingerprint;
          autoFailedFingerprint.current = null;
          autoSaveVersion.current = version + 1;
          setAutoSaveError('');
          setAutoSaveState(
            latestFingerprint.current === autoSaveFingerprint
              ? 'saved'
              : 'saving',
          );
          setActive((previous) =>
            previous?.id === documentId
              ? {
                  ...previous,
                  title: autoSaveContent.title,
                  version: version + 1,
                  updated_at: new Date().toISOString(),
                  document: {
                    ...previous.document,
                    items: autoSaveContent.items,
                    selections: autoSaveContent.selections,
                    ...(autoSaveContent.labour
                      ? { labour: autoSaveContent.labour }
                      : {}),
                    ...(autoSaveContent.projectCosts
                      ? { projectCosts: autoSaveContent.projectCosts }
                      : {}),
                    scopeReviews: autoSaveContent.scopeReviews,
                    ...(autoSaveContent.generator
                      ? { generator: autoSaveContent.generator }
                      : {}),
                  },
                }
              : previous,
          );
        })
        .catch((error: unknown) => {
          if (autoSavedDocId.current !== documentId) return;
          autoFailedFingerprint.current = autoSaveFingerprint;
          lastFailedRetry.current = retryAutoSave;
          setAutoSaveError(
            error instanceof Error ? error.message : 'Could not save the BOQ.',
          );
          setAutoSaveState('error');
        })
        .finally(() => {
          autoSaving.current = false;
          // Changes made while an earlier version was in-flight are queued
          // for the next sequential save, avoiding version conflicts.
          if (
            latestFingerprint.current !== autoSavedFingerprint.current &&
            latestFingerprint.current !== autoFailedFingerprint.current
          )
            setAutoSaveCycle((previous) => previous + 1);
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    screen,
    active?.id,
    active?.version,
    canEdit,
    autoSaveContent,
    autoSaveFingerprint,
    liveKey,
    lastLiveKey,
    calculating,
    schedule,
    retryAutoSave,
    autoSaveCycle,
  ]);
  const autoSaveLabel =
    autoSaveState === 'error'
      ? 'Automatic save failed'
      : autoSaveState === 'saving'
        ? 'Saving automatically…'
        : autoSavedFingerprint.current &&
            autoSavedFingerprint.current !== autoSaveFingerprint
          ? 'Unsaved changes…'
          : 'Saved automatically';

  function updateOutputQuantity(
    lineIndex: number,
    outputIndex: number,
    quantity: number,
  ) {
    const target = lines[lineIndex];
    const output = target?.outputs[outputIndex];
    if (
      target?.origin &&
      output &&
      isAutoPlasterQuantity(target.kind, output.name)
    )
      return;
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
    // Inherited manual items stay linked until that floor is customized.
    setLines((prior) =>
      prior.map((line, i) =>
        i === lineIndex ||
        (target &&
          !target.origin &&
          line.inputs.repeatedFrom === target.section &&
          line.inputs.sourceLineId === target.id)
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
  function resetOutputQuantity(lineIndex: number, outputIndex: number) {
    const line = lines[lineIndex];
    const output = line?.outputs[outputIndex];
    if (
      !line?.origin ||
      !output ||
      isAutoPlasterQuantity(line.kind, output.name)
    )
      return;
    const key = overrideKey(line, output);
    const existing = overrides[key];
    if (!existing || existing.quantity === undefined) return;
    const next = { ...overrides };
    if (existing.rate !== undefined) next[key] = { rate: existing.rate };
    else delete next[key];
    setOverrides(next);
    generateFromQuote(true, next);
  }

  function updateOutputRate(
    lineIndex: number,
    outputIndex: number,
    rate: number,
  ) {
    const target = lines[lineIndex];
    const output = target?.outputs[outputIndex];
    if (target?.origin && output?.material === 'concrete_m20') {
      // The price belongs to the whole structural RCC package.
      setRmcRateOverride(Number.isFinite(rate) ? Math.max(0, rate) : 0);
      return;
    }
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
        i === lineIndex ||
        (target &&
          !target.origin &&
          line.inputs.repeatedFrom === target.section &&
          line.inputs.sourceLineId === target.id)
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
  function save() {
    const measurementError = validateBoqMeasurements(lines, Boolean(schedule));
    if (measurementError) {
      setMessage(measurementError);
      setCreateError(measurementError);
      return;
    }
    if (
      !active &&
      (!newProjects.some((project) => project.id === projectId) ||
        !quoteForProject(projectId))
    ) {
      setMessage('Choose a new project with a saved quotation.');
      setCreateError('Choose a project with a Final quotation.');
      return;
    }
    if (!title.trim()) {
      setMessage('Enter a BOQ name.');
      setCreateError('Enter a BOQ name.');
      return;
    }
    if (calculating || (quoteId && !generator && lines.length === 0)) {
      setCreateError('The quotation quantities are still being prepared.');
      return;
    }
    setCreateError('');
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
        ...(labour && canViewCost ? { labour } : {}),
        ...(canViewCost ? { projectCosts } : {}),
        scopeReviews,
        ...(generator ? { generator: { ...generator, repeatFrom } } : {}),
        ...(canViewCost ? { costSummary: materialSummary } : {}),
      });
      if (!result.ok) {
        setMessage(result.message || 'Could not save BOQ.');
        setCreateError(result.message || 'Could not create BOQ.');
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
          ...(labour && canViewCost ? { labour } : {}),
          ...(canViewCost ? { projectCosts } : {}),
          scopeReviews,
          ...(generator ? { generator: { ...generator, repeatFrom } } : {}),
        },
        updated_at: new Date().toISOString(),
      });
      setScreen('edit');
      setShowSavedDetails(false);
      setAutoSaveState('saved');
      setAutoSaveError('');
      router.replace(
        `/dashboard/execution/boq?open=${encodeURIComponent(result.id || active?.id || '')}&mode=edit`,
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
        setShowSavedDetails(false);
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
          ...(following.finishes![from]!.kitchenMeasurements
            ? {
                kitchenMeasurements: following.finishes![
                  from
                ]!.kitchenMeasurements!.map((kitchen) => ({
                  ...kitchen,
                  id: uid(),
                })),
              }
            : {}),
        };
      }
      if (following.windowSizes?.[from] !== undefined)
        following.windowSizes![target] = following.windowSizes![from]!;
      if (following.doorSizes?.[from])
        following.doorSizes = {
          ...following.doorSizes,
          [target]: { ...following.doorSizes[from]! },
        };
      if (following.walls?.[from])
        following.walls = {
          ...following.walls,
          [target]: following.walls[from]!.map((wall) => ({
            ...wall,
            id: uid(),
          })),
        };
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
  // A measured rectangular work item is the single source for its volume,
  // material quantities and order rates (not an unpriced notes-only row).
  function addStageGeometry(
    stage: string,
    kind: MeasuredKind,
    name: string,
    values: MeasuredDimensions,
  ) {
    const outputs = measuredOutputs(kind, values, settings).map((output) =>
      fillingOutput(name, output),
    );
    if (!outputs.length) {
      setMessage(
        'Enter a positive count, length, width and depth for measured work.',
      );
      return;
    }
    const item: SavedLine = {
      id: uid(),
      name:
        name.trim().slice(0, 200) ||
        (
          {
            excavation: 'Excavation',
            soil: 'Soil filling',
            pcc: 'PCC bed',
            sajjas: 'Sajjas / chajjas',
            shelves: 'RCC shelves',
          } as const
        )[kind],
      section: stage,
      kind: 'measured-geometry',
      unit: 'm³',
      inputs: {
        count: values.count,
        lengthFeet: values.lengthFeet,
        widthFeet: values.widthFeet,
        depthFeet: values.depthFeet,
        stageCategory: kind,
        ...(kind === 'shelves' && values.shelfStandard
          ? { shelfStandard: true }
          : {}),
        ...(['sajjas', 'shelves'].includes(kind) && values.steelSets?.length
          ? { steelSetsJson: JSON.stringify(values.steelSets) }
          : {}),
      },
      outputs,
      notes: '',
    };
    const children = Object.entries(repeatFrom)
      .filter(([, source]) => source === stage)
      .map(([target, source]): SavedLine => ({
        ...item,
        id: uid(),
        section: target,
        inputs: { ...item.inputs, repeatedFrom: source, sourceLineId: item.id },
      }));
    setLines((prior) => [...prior, item, ...children]);
    setMessage(`${item.name} measured and added. Save BOQ to keep it.`);
  }
  function updateStageGeometry(
    index: number,
    values: MeasuredDimensions,
    newName: string,
  ) {
    const original = lines[index];
    if (!original || original.kind !== 'measured-geometry') return;
    const kind = original.inputs.stageCategory as MeasuredKind;
    let steelSets = values.steelSets;
    if (!steelSets && typeof original.inputs.steelSetsJson === 'string') {
      try {
        const saved = JSON.parse(original.inputs.steelSetsJson) as unknown;
        if (Array.isArray(saved)) steelSets = saved.slice(0, 16);
      } catch {
        /* No implied steel if a legacy note is malformed. */
      }
    }
    const outputs = measuredOutputs(
      kind,
      {
        ...values,
        ...(kind === 'shelves'
          ? { shelfStandard: original.inputs.shelfStandard === true }
          : {}),
        ...(steelSets ? { steelSets } : {}),
      },
      settings,
    );
    const steelSetsJson = JSON.stringify(steelSets ?? []);
    setLines((prior) =>
      prior.map((line, i) =>
        i === index ||
        (line.inputs.repeatedFrom === original.section &&
          line.inputs.sourceLineId === original.id)
          ? {
              ...line,
              name: newName.trim().slice(0, 200) || original.name,
              inputs: {
                ...line.inputs,
                count: values.count,
                lengthFeet: values.lengthFeet,
                widthFeet: values.widthFeet,
                depthFeet: values.depthFeet,
                ...(['sajjas', 'shelves'].includes(kind)
                  ? { steelSetsJson }
                  : {}),
              },
              outputs: outputs
                .map((output) =>
                  fillingOutput(newName.trim() || original.name, output),
                )
                .map((output) => {
                  const priorOutput = original.outputs.find(
                    (previous) =>
                      previous.name === output.name &&
                      previous.unit === output.unit &&
                      previous.material === output.material &&
                      previous.diameter === output.diameter,
                  );
                  return priorOutput?.rate !== undefined
                    ? { ...output, rate: priorOutput.rate }
                    : output;
                }),
            }
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
    itemName: string,
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
    const safeName = itemName.trim().slice(0, 200) || label;
    const item: SavedLine = {
      id: uid(),
      name: safeName,
      section: stage,
      kind: category === 'miscellaneous' ? 'manual' : 'custom-work',
      unit: measureUnit,
      inputs: { quantity, stageCategory: category },
      outputs: [{ name: safeName, quantity, unit: measureUnit, rate }],
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
      label +
        ' added to ' +
        stage +
        '. Automatic saving will keep the measurement.',
    );
  }

  function updateMiscellaneous(
    index: number,
    changes: { name: string; quantity: number; unit: string; rate: number },
  ) {
    setLines((prior) => {
      const original = prior[index];
      if (!original || original.kind !== 'manual' || original.origin)
        return prior;
      const name = changes.name.slice(0, 200);
      const quantity = Number.isFinite(changes.quantity)
        ? Math.max(0, changes.quantity)
        : 0;
      const rate = Number.isFinite(changes.rate)
        ? Math.max(0, changes.rate)
        : 0;
      const unit = changes.unit.slice(0, 20) || 'nos';
      return prior.map((line, i) => {
        const followsSource =
          line.inputs.repeatedFrom === original.section &&
          line.inputs.sourceLineId === original.id;
        if (i !== index && !followsSource) return line;
        return {
          ...line,
          name,
          unit,
          inputs: { ...line.inputs, quantity },
          outputs: line.outputs.map((output, outputIndex) =>
            outputIndex === 0
              ? { ...output, name, quantity, unit, rate }
              : output,
          ),
        };
      });
    });
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
  const detailedPricingLines = allOutputs.map((output, index) => ({
    id: `${output.lineId}-${index}`,
    stage: output.section || 'Other',
    work: output.lineName,
    name: output.name,
    quantity: output.quantity,
    unit: output.unit,
    rate: output.rate,
  }));
  const detailedFloorPricing = buildFloorPricing(
    allOutputs.map((output) => ({
      stage: output.section,
      amount: output.quantity * output.rate,
      isLabour: isLabourOutput(output),
    })),
    labour ? labourEstimate.byStage : {},
    floorsForGeneration,
    stages,
  );
  function openDetailedBoq() {
    if (!active) {
      setMessage('Save the BOQ before viewing the detailed estimate.');
      return;
    }
    if (
      autoSaveState !== 'saved' ||
      autoSaving.current ||
      (autoSavedFingerprint.current !== null &&
        autoSavedFingerprint.current !== autoSaveFingerprint)
    ) {
      setMessage(
        'Your changes are still saving. Open Detailed BOQ after the saved status appears.',
      );
      return;
    }
    setMessage('');
    setShowSavedDetails(true);
    setScreen('view');
    router.replace(
      `/dashboard/execution/boq?open=${encodeURIComponent(active.id)}`,
    );
  }

  function editDocument() {
    if (!active || !canEdit) return;
    setScreen('edit');
    router.replace(
      `/dashboard/execution/boq?open=${encodeURIComponent(active.id)}&mode=edit`,
    );
  }
  if (screen === 'new' && !active) {
    return (
      <BoqCreateStep
        projects={newProjects}
        projectId={projectId}
        title={title === 'Construction BOQ' ? '' : title}
        quoteLabel={currentQuote?.label ?? ''}
        floors={floorsForGeneration.length}
        builtUpSqft={builtUpSqft}
        saving={busy}
        preparing={Boolean(
          quoteId && (calculating || (!generator && lines.length === 0)),
        )}
        error={createError}
        onProjectChange={selectProject}
        onTitleChange={setTitle}
        onContinue={save}
      />
    );
  }
  if (screen === 'view' && !showSavedDetails) {
    return (
      <BoqRegisterLanding
        documents={documents}
        projects={projects}
        canCreate={canCreate}
        canEdit={canEdit}
        canStartNew={newProjects.length > 0}
        onView={(id) => {
          const document = documents.find((item) => item.id === id);
          if (document) openDocument(document, 'view');
        }}
        onEdit={(id) => {
          const document = documents.find((item) => item.id === id);
          if (document && canEdit) openDocument(document, 'edit');
        }}
      />
    );
  }
  if (screen === 'view') {
    return (
      <main className="erp-page manual-boq boq-readonly boq-view-detail">
        <div className="boq-view-back">
          <button
            type="button"
            className="erp-button"
            onClick={() => {
              setShowSavedDetails(false);
              router.replace('/dashboard/execution/boq');
            }}
          >
            ← Completed BOQs
          </button>
        </div>
        {message && (
          <p className="boq-notice" role="status">
            {message}
          </p>
        )}
        <div className="boq-layout boq-layout-full">
          <section className="boq-editor">
            {active ? (
              <>
                <div className="boq-panel-heading">
                  <div>
                    <h2>Detailed BOQ</h2>
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
                    <span>Material Cost</span>
                    <strong>
                      {canViewCost ? money(materialOnlyCost) : 'Restricted'}
                    </strong>
                  </div>
                  <div>
                    <span>Labour Cost</span>
                    <strong>
                      {canViewCost ? money(labourCost) : 'Restricted'}
                    </strong>
                  </div>
                  <div>
                    <span>
                      {!unpricedOutputs.length &&
                      (generator?.engineVersion ?? 0) >= BOQ_ENGINE_VERSION &&
                      !generator?.warnings.some((warning) =>
                        warning.includes('Measurement pending'),
                      )
                        ? 'Total project cost estimate'
                        : 'Provisional project estimate'}
                    </span>
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
                {canViewCost && unpricedOutputs.length > 0 && (
                  <p className="boq-notice" role="status">
                    Estimate incomplete: {unpricedOutputs.length} cost items
                    have no priced supplier/trade rate. Review{' '}
                    {unpricedOutputs
                      .slice(0, 4)
                      .map((item) => item.name)
                      .join(', ')}
                    {unpricedOutputs.length > 4 ? ' and others' : ''}. Do not
                    use this subtotal as the final project cost.
                  </p>
                )}

                {labour && canViewCost && (
                  <section className="boq-labour-saved">
                    <h3>Labour Costing Summary</h3>
                    <div className="boq-labour-saved-grid">
                      <div>
                        <small>Default method</small>
                        <strong>
                          {labour.method === 'composite'
                            ? labour.packageName +
                              ' · ' +
                              money(labour.rate) +
                              '/sft'
                            : labour.method === 'itemwise'
                              ? 'Item-wise measured work'
                              : 'Daily wage estimate'}
                        </strong>
                      </div>
                      <div>
                        <small>Default labour</small>
                        <strong>{money(labourEstimate.base)}</strong>
                      </div>
                      <div>
                        <small>Trades not in package</small>
                        <strong>
                          {money(legacyLabourCost + labourEstimate.extras)}
                        </strong>
                      </div>
                      <div>
                        <small>Total estimated labour</small>
                        <strong>{money(labourCost)}</strong>
                      </div>
                    </div>
                    {labour.method === 'composite' && (
                      <p>
                        Package covers:{' '}
                        {labour.coveredWorks.map(labourWorkName).join(', ') ||
                          'none'}
                      </p>
                    )}
                    {tradeLabourSummary.length > 0 && (
                      <div className="boq-labour-saved-extras">
                        {tradeLabourSummary.map((row) => (
                          <div key={row.head}>
                            <span>{row.head}</span>
                            <strong>{money(row.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {!!labour.extras.length && (
                      <div className="boq-labour-saved-extras">
                        {labour.extras.map((extra) => (
                          <div key={extra.id}>
                            <span>
                              {extra.name} · {extra.stage}
                            </span>
                            <strong>
                              {money(
                                extra.method === 'daily'
                                  ? extra.workers * extra.days * extra.rate
                                  : labourExtraQuantity(extra, measuredLabour) *
                                      extra.rate,
                              )}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
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
                      Measurement review ({generator.warnings.length})
                    </summary>
                    <ul>
                      {generator.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <BoqFinalFloorPricing
                  rows={detailedFloorPricing}
                  lines={detailedPricingLines}
                  labourAllocations={labour ? labourEstimate.byStage : {}}
                  materialCost={materialOnlyCost}
                  labourCost={labourCost}
                  overheadCost={0}
                  totalCost={materialCost}
                  areaSqft={builtUpSqft}
                  canViewCost={canViewCost}
                />
                {canViewCost && materialSummary.length > 0 && (
                  <section
                    className="boq-material-summary"
                    aria-labelledby="boq-material-summary-heading"
                  >
                    <h3 id="boq-material-summary-heading">
                      Material-wise cost
                    </h3>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th>Quantity</th>
                            <th>Amount</th>
                            <th>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materialSummary.map((row) => (
                            <tr key={row.head}>
                              <td>{row.head}</td>
                              <td>
                                {row.quantity !== null && row.quantity > 0
                                  ? row.quantity.toLocaleString('en-IN', {
                                      maximumFractionDigits: 1,
                                    }) +
                                    ' ' +
                                    row.unit
                                  : '—'}
                              </td>
                              <td>{money(row.amount)}</td>
                              <td>
                                {materialOnlyCost > 0
                                  ? Math.round(
                                      (row.amount / materialOnlyCost) * 100,
                                    ) + '%'
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th>Total materials</th>
                            <th />
                            <th>{money(materialOnlyCost)}</th>
                            <th>100%</th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                )}
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
          <span>Materials</span>
          <strong>
            {canViewCost ? money(materialOnlyCost) : 'Restricted'}
          </strong>
        </div>
        <div>
          <span>Labour</span>
          <strong>{canViewCost ? money(labourCost) : 'Restricted'}</strong>
        </div>
        <div>
          <span>
            {!unpricedOutputs.length &&
            (generator?.engineVersion ?? 0) >= BOQ_ENGINE_VERSION &&
            !generator?.warnings.some((warning) =>
              warning.includes('Measurement pending'),
            )
              ? 'Total Project Cost'
              : 'Provisional Project Cost'}
          </span>
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
      {canViewCost && unpricedOutputs.length > 0 && (
        <p className="boq-notice" role="status">
          Estimate incomplete: {unpricedOutputs.length} cost items lack
          supplier/trade rates. Review{' '}
          {unpricedOutputs
            .slice(0, 4)
            .map((item) => item.name)
            .join(', ')}
          {unpricedOutputs.length > 4 ? ' and others' : ''}. This total excludes
          unpriced costs.
        </p>
      )}
      {message && (
        <p className="boq-notice" role="status">
          {message}
        </p>
      )}

      {active && canEdit && autoSaveState === 'error' && (
        <div
          className="boq-autosave-status"
          data-state={autoSaveState}
          role="status"
        >
          {autoSaveLabel}
          {autoSaveState === 'error' && (
            <>
              <span>{autoSaveError}</span>
              <button
                type="button"
                className="boq-autosave-retry"
                onClick={() => setRetryAutoSave((previous) => previous + 1)}
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}
      <div className="boq-layout boq-layout-full">
        <section className="boq-editor">
          <div className="boq-panel-heading">
            <div>
              <h2>{active ? 'Edit BOQ' : 'Create BOQ'}</h2>
              <span>Measured BOQ</span>
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
            key={projectId || active?.id || 'new'}
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
            legacyCountsNeedReview={Boolean(
              generator?.legacyCountsNeedReview ||
              (active &&
                generator &&
                (generator.engineVersion ?? 1) < BOQ_ENGINE_VERSION),
            )}
            onCountsChange={updateStageCounts}
            structuralSettings={concreteSettings}
            materialRates={initialRates}
            structuralRmcEnabled={rmcEnabled}
            structuralRmcRate={rmcRatePerM3}
            onStructuralRmcToggle={setRmcEnabled}
            onStructuralRmcRateChange={setRmcRateOverride}
            onAddGeometry={addStageGeometry}
            onUpdateGeometry={updateStageGeometry}
            onFloorChange={setGenFloors}
            repeatFrom={repeatFrom}
            onRepeatFloors={repeatStageFloors}
            onCustomizeFloor={customizeStageFloor}
            onUpdateQuantity={updateOutputQuantity}
            onResetQuantity={resetOutputQuantity}
            onUpdateRate={updateOutputRate}
            rateFor={priceOf}
            onAddManual={addStageManual}
            onUpdateMiscellaneous={updateMiscellaneous}
            onRemoveManual={(index) =>
              setLines((prior) => {
                const target = prior[index];
                return prior.filter(
                  (line, i) =>
                    i !== index &&
                    !(
                      target &&
                      !target.origin &&
                      line.inputs.repeatedFrom === target.section &&
                      line.inputs.sourceLineId === target.id
                    ),
                );
              })
            }
            onSave={save}
            onDetailedBoq={openDetailedBoq}
            labourContent={
              !canViewCost ? (
                <p className="boq-notice">Cost access required.</p>
              ) : labour ? (
                <BoqLabourPanel
                  config={labour}
                  onChange={setLabour}
                  floors={floorsForGeneration}
                  lines={lines}
                  materialCost={materialOnlyCost}
                  existingLabourCost={legacyLabourCost}
                  tradeLabour={tradeLabourSummary}
                  canEdit={(active ? canEdit : canCreate) && canViewCost}
                  canViewCost={canViewCost}
                  busy={busy}
                  onSave={save}
                  autoSaveLabel={active ? autoSaveLabel : undefined}
                />
              ) : (
                <div className="boq-labour-enable">
                  <button
                    type="button"
                    className="erp-button erp-button-primary"
                    disabled={!(active ? canEdit : canCreate)}
                    onClick={() => setLabour({ ...DEFAULT_LABOUR })}
                  >
                    Enable Composite Labour at ₹400/sft
                  </button>
                </div>
              )
            }
            isLabourOutput={isLabourOutput}
            isUnpricedOutput={(output) =>
              !isOldLabour(output) && isBoqCostUnpriced(output, priceOf)
            }
            projectLabourCost={labourCost}
            projectMaterialCost={materialOnlyCost}
            calculating={calculating}
            canOpenDetailed={Boolean(active)}
            canViewCost={canViewCost}
            busy={busy}
            canSave={active ? canEdit : canCreate}
            autoSaveLabel={active ? autoSaveLabel : undefined}
            message={message}
            newDocument={!active}
            labourStageCosts={labour ? labourEstimate.byStage : undefined}
            projectTotalCost={labour ? materialCost : undefined}
            isOldLabourOutput={labour ? isOldLabour : undefined}
          />
        </section>
      </div>
    </main>
  );
}
