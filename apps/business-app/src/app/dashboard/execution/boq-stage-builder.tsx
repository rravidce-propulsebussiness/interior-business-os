'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { NumberField } from './boq-number-field';
import type { Rate } from './boq-pricing';
import { isAutoPlasterQuantity } from './boq-plaster-guards';
import {
  BoqFloorProjectSetup,
  BoqWizardProgress,
  BOQ_WIZARD_STEPS,
  nextBoqStep,
  previousBoqStep,
  wizardStep,
} from './boq-wizard-flow';
import type {
  BoqCounts,
  BoqFloor,
  DesignBeamType,
  DesignPlinthBeamType,
  DesignColumnType,
  DesignSlabPanel,
  DesignStairType,
  DesignSettingKey,
  StructuralDesign,
  StructuralSettings,
  WallMeasure,
} from '@business-os/core/construction-boq';
import {
  measuredVolume,
  standardShelfTakeoff,
  STANDARD_SHELF_ASSUMPTIONS,
  FEET_PER_METRE,
  type MeasuredDimensions,
  type MeasuredKind,
  readMeasuredSteelSets,
} from './boq-stage-measurements';
import { BoqFootingEditor } from './boq-footing-editor';
import {
  BoqSlabScheduleEditor,
  BoqStaircaseScheduleEditor,
  BoqSmallRccSteelEditor,
} from './boq-structural-schedule-editors';
import { BarsPicker } from './boq-design-schedule';
import { beamTotalRunAfterCountChange } from './boq-beam-run-calculation';
import {
  MEASURED_SERVICE_FIELDS,
  parseBars,
} from '@business-os/core/construction-boq';
import { BoqStructuralConcreteCard } from './boq-structural-concrete-card';
import {
  copyExteriorWallsToFullFloors,
  isPenthouseFloor,
} from './boq-floor-scopes';

export type StageBoqOutput = {
  name: string;
  quantity: number;
  unit: string;
  material?: string;
  rate?: number;
  quotedRate?: number;
  weightKg?: number;
  source?: string;
};
export type StageBoqLine = {
  id: string;
  name: string;
  section: string;
  kind: string;
  unit?: string;
  origin?: string;
  inputs: Record<string, string | number | boolean>;
  outputs: StageBoqOutput[];
};
type Category = { key: string; label: string; icon: string };
type Entry = {
  line: StageBoqLine;
  lineIndex: number;
  output: StageBoqOutput;
  outputIndex: number;
};
type Props = {
  floors: BoqFloor[];
  lines: StageBoqLine[];
  projectId: string;
  projects: { id: string; name: string; eligible: boolean }[];
  onProjectChange: (id: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  quoteLabel: string;
  design: StructuralDesign | null;
  onDesignChange: (next: StructuralDesign) => void;
  counts: BoqCounts;
  legacyCountsNeedReview?: boolean;
  onCountsChange: (next: BoqCounts) => void;
  structuralSettings: StructuralSettings;
  materialRates?: readonly Rate[];
  structuralRmcEnabled: boolean;
  structuralRmcRate: number;
  onStructuralRmcToggle: (enabled: boolean) => void;
  onStructuralRmcRateChange: (rate: number) => void;
  onAddGeometry: (
    stage: string,
    kind: MeasuredKind,
    name: string,
    dimensions: MeasuredDimensions,
  ) => void;
  onUpdateGeometry: (
    lineIndex: number,
    dimensions: MeasuredDimensions,
    name: string,
  ) => void;
  onFloorChange: (floors: BoqFloor[]) => void;
  repeatFrom: Record<string, string>;
  onRepeatFloors: (floors: string[], repeat: boolean) => void;
  onCustomizeFloor: (floor: string) => void;
  onUpdateQuantity: (
    lineIndex: number,
    outputIndex: number,
    quantity: number,
  ) => void;
  onResetQuantity: (lineIndex: number, outputIndex: number) => void;
  onUpdateRate: (lineIndex: number, outputIndex: number, rate: number) => void;
  rateFor: (output: StageBoqOutput) => number;
  onAddManual: (
    stage: string,
    category: string,
    quantity: number,
    unit: string,
    rate: number,
    itemName: string,
  ) => void;
  onRemoveManual: (lineIndex: number) => void;
  onUpdateMiscellaneous: (
    lineIndex: number,
    changes: { name: string; quantity: number; unit: string; rate: number },
  ) => void;
  onSave: () => void;
  onDetailedBoq: () => void;
  labourContent?: ReactNode;
  isLabourOutput?: (output: StageBoqOutput) => boolean;
  isUnpricedOutput?: (output: StageBoqOutput) => boolean;
  projectLabourCost?: number;
  projectMaterialCost?: number;
  calculating?: boolean;
  /** Used by render tests and deep-link recovery; new BOQs open floor setup. */
  initialStep?: number;
  canOpenDetailed: boolean;
  canViewCost: boolean;
  busy: boolean;
  canSave: boolean;
  autoSaveLabel?: string | undefined;
  message?: string;
  newDocument: boolean;
  /** Allocated contract labour for this stage, not a second per-item charge. */
  labourStageCosts?: Record<string, number> | undefined;
  projectTotalCost?: number | undefined;
  isOldLabourOutput?: ((output: StageBoqOutput) => boolean) | undefined;
};

const foundation: Category[] = [
  { key: 'excavation', label: 'Excavation', icon: '♢' },
  { key: 'soil', label: 'Soil Filling', icon: '▱' },
  { key: 'pcc', label: 'PCC Bed', icon: '▤' },
  { key: 'footings', label: 'Footings', icon: '⌑' },
  { key: 'columns', label: 'Columns', icon: '▥' },
  { key: 'plinth', label: 'Plinth Beam', icon: '▰' },
];
const standard: Category[] = [
  { key: 'compound', label: 'Compound Wall', icon: '▦' },
  { key: 'columns', label: 'Columns', icon: '▥' },
  { key: 'beams', label: 'Beams', icon: '⌑' },
  { key: 'slab', label: 'Slab', icon: '▱' },
  { key: 'staircase', label: 'Staircase', icon: '▰' },
  { key: 'brickwork', label: 'Brickwork', icon: '▦' },
  { key: 'sajjas', label: 'Sajjas / Sunshades', icon: '▱' },
  { key: 'shelves', label: 'RCC Shelves', icon: '▤' },
  { key: 'plaster', label: 'Plastering', icon: '◩' },
  { key: 'painting', label: 'Painting', icon: '▤' },
  { key: 'tiles', label: 'Tiles', icon: '▦' },
  { key: 'electrical', label: 'Electrical', icon: 'ϟ' },
  { key: 'plumbing', label: 'Plumbing', icon: '♧' },
  { key: 'doors', label: 'Doors & Windows', icon: '▯' },
];
const terrace: Category[] = [
  ...standard,
  { key: 'penthouse', label: 'Penthouse / Headroom', icon: '⌂' },
  { key: 'parapet', label: 'Parapet Wall', icon: '▥' },
  { key: 'waterproofing', label: 'Waterproofing', icon: '♧' },
];
const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
const number = (amount: number) =>
  amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const blankDesign = (): StructuralDesign => ({
  footings: [],
  columns: [],
  beams: [],
  plinthRunFeet: 0,
  settings: {},
});
const newColumn = (n: number): DesignColumnType => ({
  label: 'C' + (n + 1),
  count: 0,
  floors: 0,
  widthIn: 9,
  depthIn: 12,
  bars: '',
  tieDia: 8,
  tieSpacingIn: 6,
  footingLengthFeet: 5,
  footingWidthFeet: 5,
  footingThicknessIn: 12,
  footingBarDia: 12,
  footingBarSpacingIn: 6,
});
const newBeam = (n: number, count: number): DesignBeamType => ({
  label: 'B' + (n + 1),
  widthIn: 9,
  depthIn: 15,
  bars: '',
  stirrupDia: 8,
  stirrupSpacingIn: 6,
  runFeet: Array.from({ length: count }, () => 0),
});
const isMeasuredFooting = (design: StructuralDesign | null) =>
  Boolean(
    design?.footings?.some(
      (row) =>
        row.count > 0 &&
        row.lengthFeet > 0 &&
        row.widthFeet > 0 &&
        row.thicknessIn > 0,
    ),
  );
const isMeasuredColumn = (design: StructuralDesign | null) =>
  Boolean(
    design?.columns.some(
      (col) => col.count > 0 && /[0-9]+\s*[-×x*#]\s*[0-9]+/.test(col.bars),
    ),
  );
const isMeasuredBeam = (design: StructuralDesign | null, floorIndex: number) =>
  Boolean(
    design?.beams.some(
      (beam) =>
        (beam.runFeet[floorIndex] ?? 0) > 0 &&
        /[0-9]+\s*[-×x*#]\s*[0-9]+/.test(beam.bars),
    ),
  );
const manualCategory = (line: StageBoqLine) =>
  String(line.inputs.stageCategory || '').toLowerCase();

/** Generated quantities come from window or wall schedules; only rate can
 * be overridden. Removing a cost material without changing the source
 * dimensions would silently understate the estimate.
 */
export function isDerivedQuantityReadOnly(kind: string, name: string) {
  return kind === 'quote-window-sajjas' || isAutoPlasterQuantity(kind, name);
}

function categoryFor(line: StageBoqLine, output: StageBoqOutput): string {
  const kind = line.kind.toLowerCase();
  const name = (line.name + ' ' + output.name).toLowerCase();
  // Manual extras belong to one stage-level Miscellaneous area, even if
  // a saved BOQ previously attached them to Footings, Painting, etc.
  if (kind === 'manual') return 'miscellaneous';
  const specified = manualCategory(line);
  if (specified) return specified;
  if (kind === 'quote-foundation') {
    if (/excavat|earthwork/i.test(output.name)) return 'excavation';
    if (/pcc|cement|sand|aggregate/i.test(output.name)) return 'pcc';
    return 'footings';
  }
  if (kind === 'quote-footings') return 'footings';
  if (kind === 'quote-columns') return 'columns';
  if (kind === 'quote-window-sajjas') return 'doors';
  if (kind === 'quote-pedestals') return 'footings';
  if (kind === 'quote-plinth-beam') return 'plinth';
  if (kind === 'quote-beams') return 'beams';
  if (kind === 'quote-slab') return 'slab';
  if (kind === 'quote-staircase' || kind === 'quote-railings')
    return 'staircase';
  if (kind === 'quote-flooring' && /staircase granite/i.test(output.name))
    return 'staircase';
  if (kind === 'quote-kitchen')
    return /sink/i.test(output.name) ? 'plumbing' : 'tiles';
  if (kind === 'quote-masonry')
    return /^(?:Internal|External) plaster(?:\s|$)|\(plaster\)/i.test(
      output.name,
    )
      ? 'plaster'
      : 'brickwork';
  if (kind === 'quote-parapet') {
    return /waterproof|membrane|coat|sealant/i.test(output.name)
      ? 'waterproofing'
      : 'parapet';
  }
  if (kind === 'quote-compound-wall') return 'compound';
  if (kind === 'quote-binding-wire')
    return line.section === 'Foundation' ? 'footings' : 'slab';
  if (/soil fill|backfill|earth fill/i.test(name)) return 'soil';
  if (/excavat/i.test(name)) return 'excavation';
  if (/footing/i.test(name)) return 'footings';
  if (/plinth/i.test(name)) return 'plinth';
  if (/column/i.test(name)) return 'columns';
  if (/beam/i.test(name)) return 'beams';
  if (/slab/i.test(name)) return 'slab';
  if (/stair/i.test(name)) return 'staircase';
  if (/compound|boundary wall/i.test(name)) return 'compound';
  if (/parapet/i.test(name)) return 'parapet';
  if (/waterproof|membrane/i.test(name)) return 'waterproofing';
  if (/paint|primer|putty/i.test(name)) return 'painting';
  if (/plaster/i.test(name)) return 'plaster';
  if (/tile|granite|marble|skirting/i.test(name)) return 'tiles';
  if (/electrical|wiring|switch|socket|fan|light|cable/i.test(name))
    return 'electrical';
  if (/plumb|pipe|sanitary|fitting|tap|water line/i.test(name))
    return 'plumbing';
  if (/door|window|ventilator|shutter/i.test(name)) return 'doors';
  if (/brick|masonry|block/i.test(name)) return 'brickwork';
  return 'extra';
}

function stageFor(line: StageBoqLine, floors: BoqFloor[]) {
  const found = floors.find((f) => f.name === line.section);
  if (found) return found.name;
  if (line.section === 'Foundation' || /foundation/i.test(line.section))
    return 'Foundation';
  if (/parapet|waterproof/i.test(line.name) && floors.length)
    return floors[floors.length - 1]!.name;
  if (line.kind === 'quote-compound-wall' && floors.length)
    return floors[0]!.name;
  // Retain all unscoped quotation allowances in the project total.
  return floors[0]?.name ?? 'Foundation';
}

/** Values shown in the slab editor until the drawing's own are entered. */
export const SLAB_FIELD_DEFAULTS = {
  slabThicknessIn: 5,
  slabMainDia: 10,
  slabMainSpacingIn: 6,
  slabDistDia: 8,
  slabDistSpacingIn: 8,
} as const;

/** A slab counts as measured only when its whole bar schedule is stored, so
 * editing one slab field records the values shown for all of them. */
export function withSlabSchedule(
  settings: Partial<Record<DesignSettingKey, number>> | undefined,
  key?: DesignSettingKey,
  value?: number,
): Partial<Record<DesignSettingKey, number>> {
  const next: Partial<Record<DesignSettingKey, number>> = { ...settings };
  if (key === undefined || key in SLAB_FIELD_DEFAULTS)
    for (const [name, fallback] of Object.entries(SLAB_FIELD_DEFAULTS))
      next[name as DesignSettingKey] ??= fallback;
  if (key !== undefined && value !== undefined) next[key] = value;
  return next;
}

export function InputNumber({
  label,
  value,
  onChange,
  unit,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
}) {
  return (
    <label className="boq-stage-field">
      <span>
        {label}
        {unit ? ' (' + unit + ')' : ''}
      </span>
      {/* Feet boxes read drawing sizes (5'4" = 5.33 ft). A number box
          silently turned 5'4" into 54 and the excavation into 899 m³. */}
      <NumberField
        label={label + (unit ? ' (' + unit + ')' : '')}
        value={value}
        min={min}
        feet={unit === 'ft'}
        onChange={onChange}
      />
    </label>
  );
}
function InputText({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="boq-stage-field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function BoqStageBuilder(props: Props) {
  const [activeTab, setActiveTab] = useState(
    (props.initialStep ?? 2) >= 7 && (props.initialStep ?? 2) <= 11
      ? (props.floors[0]?.name ?? 'Foundation')
      : 'Foundation',
  );
  const [guidedStep, setGuidedStep] = useState(props.initialStep ?? 2);
  const [reviewedSteps, setReviewedSteps] = useState<number[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [editing, setEditing] = useState<{
    stage: string;
    category: string;
  } | null>(null);
  // The full price report now lives in one final Detailed BOQ view.
  const preview = false;
  const [manualQuantity, setManualQuantity] = useState(0);
  const [manualRate, setManualRate] = useState(0);
  const [manualName, setManualName] = useState('');
  const [manualUnit, setManualUnit] = useState('sqft');
  const [miscellaneousStage, setMiscellaneousStage] = useState<string | null>(
    null,
  );
  const [dimensionUnit, setDimensionUnit] = useState<'ft' | 'm'>('ft');
  const [dimensionDraft, setDimensionDraft] = useState<MeasuredDimensions>({
    count: 1,
    lengthFeet: 0,
    widthFeet: 0,
    depthFeet: 0,
  });
  const [dimensionName, setDimensionName] = useState('');
  const [wallDraft, setWallDraft] = useState<WallMeasure>({
    id: 'new',
    name: '',
    location: 'external',
    count: 1,
    lengthFeet: 0,
    heightFeet: 0,
    thicknessIn: 9,
  });
  const last = props.floors[props.floors.length - 1]?.name ?? '';
  const isPenthouse = isPenthouseFloor;
  const standardFloors = props.floors
    .slice(1)
    .filter((floor) => !isPenthouse(floor));
  const syncFocusUrl = (next: { stage: string; category: string } | null) => {
    const url = new URL(window.location.href);
    if (next) {
      url.searchParams.set('stage', next.stage);
      url.searchParams.set('work', next.category);
    } else {
      url.searchParams.delete('stage');
      url.searchParams.delete('work');
    }
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
  };
  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href);
      const stage = url.searchParams.get('stage');
      const category = url.searchParams.get('work');
      if (stage && category) {
        const matchingStep = BOQ_WIZARD_STEPS.find(
          (step) =>
            step.scope === (stage === 'Foundation' ? 'foundation' : 'floors') &&
            step.categories.includes(category),
        );
        if (matchingStep) setGuidedStep(matchingStep.number);
        setEditing({ stage, category });
        setActiveTab(stage);
      } else {
        setEditing(null);
        const requested = Number(url.searchParams.get('step'));
        const next = BOQ_WIZARD_STEPS.find(
          (step) => step.number === requested && step.scope !== 'final',
        );
        if (next) {
          setGuidedStep(next.number);
          setActiveTab(
            next.scope === 'floors'
              ? (props.floors[0]?.name ?? 'Foundation')
              : 'Foundation',
          );
        }
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Restore saved route on mount and browser navigation.
  }, []);
  const sections = ['Foundation', ...props.floors.map((f) => f.name)];
  const selectedWizard = wizardStep(guidedStep);
  const measurementScreen = guidedStep >= 4 && guidedStep <= 11;
  const stepPosition =
    BOQ_WIZARD_STEPS.findIndex((step) => step.number === guidedStep) + 1;
  // No second structural schedule: these screens only filter existing editors.
  const guidedSections =
    selectedWizard.scope === 'foundation'
      ? ['Foundation']
      : guidedStep >= 7 && guidedStep <= 11
        ? sections.filter((section) => section !== 'Foundation')
        : sections;
  const goToWizard = (step: number) => {
    if (step === 14) {
      props.onDetailedBoq();
      return;
    }
    setGuidedStep(step);
    setEditing(null);
    setMiscellaneousStage(null);
    setShowReview(false);
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(step));
    url.searchParams.delete('stage');
    url.searchParams.delete('work');
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    const stage =
      step <= 6
        ? 'Foundation'
        : props.floors.some((floor) => floor.name === activeTab)
          ? activeTab
          : (props.floors[0]?.name ?? 'Foundation');
    setActiveTab(stage);
  };
  const priced = (output: StageBoqOutput) =>
    props.canViewCost ? output.quantity * props.rateFor(output) : 0;
  const unmeasured = (stage: string, key: string) => {
    const enteredManual = props.lines.some(
      (line) =>
        line.section === stage &&
        !line.origin &&
        line.inputs.stageCategory === key,
    );
    if (enteredManual) return false;
    if (key === 'footings') return !isMeasuredFooting(props.design);
    if (key === 'columns') return !isMeasuredColumn(props.design);
    if (key === 'plinth')
      return !(props.design?.plinthBeams?.length
        ? props.design.plinthBeams.some(
            (beam) =>
              beam.count > 0 &&
              beam.lengthFeet > 0 &&
              parseBars(beam.bars).length > 0,
          )
        : props.design?.plinthRunFeet && props.design.plinthRunFeet > 0);
    if (key === 'beams')
      return !isMeasuredBeam(
        props.design,
        Math.max(
          0,
          props.floors.findIndex((floor) => floor.name === stage),
        ),
      );
    if (key === 'slab') {
      const panels = props.design?.slabPanels?.filter((p) => p.floor === stage);
      if (panels?.length)
        return !panels.some(
          (p) =>
            p.count > 0 &&
            p.lengthFeet > 0 &&
            p.widthFeet > 0 &&
            p.thicknessIn > 0,
        );
      return !Boolean(
        props.design?.settings?.slabMainDia &&
        props.design?.settings?.slabDistDia &&
        props.design?.settings?.slabThicknessIn,
      );
    }
    if (key === 'staircase') {
      const stairs = props.design?.staircases?.filter((p) => p.floor === stage);
      if (stairs?.length)
        return !stairs.some((p) => p.count > 0 && p.widthFeet > 0);
    }
    return false;
  };
  const mapped: Entry[] = [];
  props.lines.forEach((line, lineIndex) =>
    line.outputs.forEach((output, outputIndex) => {
      mapped.push({ line, lineIndex, output, outputIndex });
    }),
  );
  const entriesFor = (stage: string, category: string): Entry[] =>
    mapped.filter((entry) => {
      const matchedStage = stageFor(entry.line, props.floors);
      const matchedCategory = categoryFor(entry.line, entry.output);
      const supported =
        stage === 'Foundation'
          ? foundation
          : stage === props.floors.at(-1)?.name
            ? terrace
            : standard;
      const bucket =
        matchedCategory === 'miscellaneous'
          ? 'miscellaneous'
          : supported.some((item) => item.key === matchedCategory)
            ? matchedCategory
            : 'extra';
      return matchedStage === stage && category === bucket;
    });
  const visibleCost = (stage: string, category: string) =>
    entriesFor(stage, category).reduce(
      (sum, entry) => sum + priced(entry.output),
      0,
    );
  const openEditor = (stage: string, category: string) => {
    if (preview) return;
    if (editing?.stage === stage && editing.category === category) {
      setEditing(null);
      syncFocusUrl(null);
      return;
    }
    syncFocusUrl({ stage, category });
    if (props.repeatFrom[stage]) props.onCustomizeFloor(stage);
    setMiscellaneousStage(null);
    setManualName('');
    setDimensionName('');
    setDimensionDraft({ count: 1, lengthFeet: 0, widthFeet: 0, depthFeet: 0 });
    setManualQuantity(0);
    setManualRate(0);
    setEditing({ stage, category });
  };
  const toggleMiscellaneous = (stage: string) => {
    if (preview) return;
    if (miscellaneousStage === stage) {
      setMiscellaneousStage(null);
      return;
    }
    if (props.repeatFrom[stage]) props.onCustomizeFloor(stage);
    setEditing(null);
    setManualName('');
    setManualQuantity(0);
    setManualRate(0);
    setManualUnit('sqft');
    setMiscellaneousStage(stage);
  };
  const drawing = props.design ?? blankDesign();
  const isGeometry = (key: string): key is MeasuredKind =>
    ['excavation', 'soil', 'pcc', 'sajjas', 'shelves'].includes(key);
  const setColumns = (columns: DesignColumnType[]) =>
    props.onDesignChange({ ...drawing, columns });
  const setFootings = (footings: StructuralDesign['footings']) =>
    props.onDesignChange({ ...drawing, footings, legacyFootings: false });
  const setBeams = (beams: DesignBeamType[]) =>
    props.onDesignChange({ ...drawing, beams });
  const setSlabPanels = (floor: string, panels: DesignSlabPanel[]) =>
    props.onDesignChange({
      ...drawing,
      slabPanels: [
        ...(drawing.slabPanels ?? []).filter((panel) => panel.floor !== floor),
        ...panels,
      ],
    });
  const setStairs = (floor: string, staircases: DesignStairType[]) =>
    props.onDesignChange({
      ...drawing,
      staircases: [
        ...(drawing.staircases ?? []).filter((stair) => stair.floor !== floor),
        ...staircases,
      ],
    });
  // A new plinth schedule supersedes the legacy single total; no doubling.
  const setPlinthBeams = (plinthBeams: DesignPlinthBeamType[]) =>
    props.onDesignChange({ ...drawing, plinthBeams, plinthRunFeet: 0 });
  const setSetting = (key: DesignSettingKey, value: number) =>
    props.onDesignChange({
      ...drawing,
      settings: withSlabSchedule(drawing.settings, key, value),
    });
  const shownSlabSettings = () => withSlabSchedule(drawing.settings);
  const slabConfirmed = Object.keys(SLAB_FIELD_DEFAULTS).every(
    (name) => drawing.settings?.[name as DesignSettingKey] !== undefined,
  );
  const fieldFor = (
    key: DesignSettingKey,
    label: string,
    fallback: number,
    unit = 'in',
  ) => (
    <InputNumber
      key={key}
      label={label}
      value={drawing.settings?.[key] ?? fallback}
      unit={unit}
      onChange={(value) => setSetting(key, value)}
    />
  );
  const repeatAll =
    standardFloors.length > 0 &&
    standardFloors.every((floor) => Boolean(props.repeatFrom[floor.name]));

  const renderEditPanel = (stage: string, category: Category) => {
    if (
      editing?.stage !== stage ||
      editing.category !== category.key ||
      preview
    )
      return null;
    const foundEntries = entriesFor(stage, category.key);
    const dimensionRows = props.lines
      .map((line, lineIndex) => ({ line, lineIndex }))
      .filter(
        ({ line }) =>
          line.section === stage &&
          line.kind === 'measured-geometry' &&
          line.inputs.stageCategory === category.key,
      );
    const isStandardShelves = category.key === 'shelves';
    const shelfPreview = isStandardShelves
      ? standardShelfTakeoff(
          dimensionDraft.lengthFeet,
          dimensionDraft.widthFeet,
          dimensionDraft.count,
        )
      : null;
    const volume = isStandardShelves
      ? { cft: shelfPreview?.volumeCft ?? 0, m3: shelfPreview?.volumeM3 ?? 0 }
      : measuredVolume(dimensionDraft);
    const displayFactor = dimensionUnit === 'm' ? 1 / FEET_PER_METRE : 1;
    const geometryValue = (
      field: 'lengthFeet' | 'widthFeet' | 'depthFeet',
      value: number,
    ) =>
      setDimensionDraft((prior) => ({
        ...prior,
        [field]: Number((value / displayFactor).toFixed(4)),
      }));
    const walls = props.counts.walls?.[stage] ?? [];
    const updateWalls = (rows: WallMeasure[]) =>
      props.onCountsChange({
        ...props.counts,
        walls: { ...props.counts.walls, [stage]: rows },
      });
    const index = props.floors.findIndex((f) => f.name === stage);
    const floor = props.floors[index];
    const current = floor ? props.counts.floors[floor.name] : null;
    const finishes = props.counts.finishes?.[stage];
    const finishDefaults = props.structuralSettings;
    const changeFinishes = (values: Record<string, unknown>) => {
      if (!floor) return;
      props.onCountsChange({
        ...props.counts,
        finishes: {
          ...props.counts.finishes,
          [stage]: {
            rooms: [],
            bathroomLengthFeet: 0,
            bathroomWidthFeet: 0,
            kitchenPlatformFeet: 0,
            railingFeet: 0,
            ...finishes,
            ...values,
          },
        },
      });
    };
    const measuredKitchens =
      finishes?.kitchenMeasurements ??
      Array.from({ length: current?.kitchens ?? 0 }, (_, i) => ({
        id: 'kitchen-default-' + i,
        name: 'Kitchen ' + (i + 1),
        platformFeet: 0,
        platformDepthFeet: 0,
        wallTileFeet: 0,
        wallTileHeightFeet: 0,
      }));
    const updateKitchens = (rows: typeof measuredKitchens) => {
      if (!current) return;
      props.onCountsChange({
        ...props.counts,
        floors: {
          ...props.counts.floors,
          [stage]: { ...current, kitchens: rows.length },
        },
        finishes: {
          ...props.counts.finishes,
          [stage]: {
            rooms: [],
            bathroomLengthFeet: 0,
            bathroomWidthFeet: 0,
            kitchenPlatformFeet: 0,
            railingFeet: 0,
            ...finishes,
            kitchenMeasurements: rows,
          },
        },
      });
    };
    const changeCount = (
      key: keyof NonNullable<typeof current>,
      value: number,
    ) => {
      if (!floor || !current) return;
      props.onCountsChange({
        ...props.counts,
        floors: {
          ...props.counts.floors,
          [floor.name]: { ...current, [key]: Math.round(value) },
        },
      });
    };
    const updateCol = (index: number, patch: Partial<DesignColumnType>) =>
      setColumns(
        drawing.columns.map((col, i) =>
          i === index ? { ...col, ...patch } : col,
        ),
      );
    const updateBeam = (index: number, patch: Partial<DesignBeamType>) =>
      setBeams(
        drawing.beams.map((beam, i) =>
          i === index ? { ...beam, ...patch } : beam,
        ),
      );
    const plinthRows: DesignPlinthBeamType[] = drawing.plinthBeams?.length
      ? drawing.plinthBeams
      : drawing.plinthRunFeet > 0
        ? [
            {
              label: 'PB1',
              count: 1,
              lengthFeet: drawing.plinthRunFeet,
              widthIn:
                drawing.settings?.plinthBeamWidthIn ??
                props.structuralSettings.plinthBeamWidthIn ??
                9,
              depthIn:
                drawing.settings?.plinthBeamDepthIn ??
                props.structuralSettings.plinthBeamDepthIn ??
                12,
              bars: `${drawing.settings?.plinthBeamBarCount ?? props.structuralSettings.plinthBeamBarCount ?? 6}-${drawing.settings?.plinthBeamBarDia ?? props.structuralSettings.plinthBeamBarDia ?? 12}`,
              stirrupDia:
                drawing.settings?.plinthBeamStirrupDia ??
                props.structuralSettings.plinthBeamStirrupDia ??
                8,
              stirrupSpacingIn:
                drawing.settings?.plinthBeamStirrupSpacingIn ??
                props.structuralSettings.plinthBeamStirrupSpacingIn ??
                6,
            },
          ]
        : [];
    const updatePlinth = (
      rowIndex: number,
      patch: Partial<DesignPlinthBeamType>,
    ) =>
      setPlinthBeams(
        plinthRows.map((row, i) =>
          i === rowIndex ? { ...row, ...patch } : row,
        ),
      );
    const isColumns = category.key === 'columns';
    const isFootings = category.key === 'footings';
    const isBeams = category.key === 'beams';
    return (
      <div className="boq-stage-edit" key={stage + ':' + category.key}>
        <div className="boq-stage-edit-head">
          <div>
            <strong>Edit {category.label}</strong>
            <small>{stage}</small>
          </div>
          <button
            type="button"
            className="boq-stage-close"
            onClick={() => {
              setEditing(null);
              syncFocusUrl(null);
            }}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
        {floor &&
          props.legacyCountsNeedReview &&
          !finishes?.countsConfirmed &&
          ['doors', 'electrical', 'plumbing', 'tiles'].includes(
            category.key,
          ) && (
            <label className="boq-stage-scope-toggle">
              <input
                type="checkbox"
                checked={false}
                onChange={() => changeFinishes({ countsConfirmed: true })}
              />
              Confirm existing floor counts against drawings
            </label>
          )}
        {isGeometry(category.key) && (
          <div className="boq-stage-dimensions">
            <label className="boq-stage-field boq-stage-unit-switch">
              <span>Input dimension unit</span>
              <select
                value={dimensionUnit}
                onChange={(event) =>
                  setDimensionUnit(event.target.value === 'm' ? 'm' : 'ft')
                }
              >
                <option value="ft">Feet (ft)</option>
                <option value="m">Metres (m)</option>
              </select>
            </label>
            {dimensionRows.map(({ line, lineIndex }) => {
              const dims: MeasuredDimensions = {
                count: Number(line.inputs.count) || 0,
                lengthFeet: Number(line.inputs.lengthFeet) || 0,
                widthFeet: Number(line.inputs.widthFeet) || 0,
                depthFeet: Number(line.inputs.depthFeet) || 0,
                shelfStandard: line.inputs.shelfStandard === true,
                ...(['sajjas', 'shelves'].includes(category.key)
                  ? {
                      steelSets: readMeasuredSteelSets(
                        line.inputs.steelSetsJson,
                      ),
                    }
                  : {}),
              };
              const standardSavedShelf =
                category.key === 'shelves' && dims.shelfStandard;
              const savedShelf = standardSavedShelf
                ? standardShelfTakeoff(
                    dims.lengthFeet,
                    dims.widthFeet,
                    dims.count,
                  )
                : null;
              const measured = standardSavedShelf
                ? {
                    cft: savedShelf?.volumeCft ?? 0,
                    m3: savedShelf?.volumeM3 ?? 0,
                  }
                : measuredVolume(dims);
              const changeDimension = (
                field: 'count' | 'lengthFeet' | 'widthFeet' | 'depthFeet',
                value: number,
              ) =>
                props.onUpdateGeometry(
                  lineIndex,
                  {
                    ...dims,
                    [field]:
                      field === 'count'
                        ? Math.round(value)
                        : Number((value / displayFactor).toFixed(4)),
                  },
                  line.name,
                );
              return (
                <div className="boq-stage-subcard" key={line.id}>
                  <div className="boq-stage-subhead">
                    <strong>{line.name}</strong>
                    <button
                      type="button"
                      onClick={() => props.onRemoveManual(lineIndex)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="boq-stage-input-grid">
                    <InputNumber
                      label="Same items"
                      value={dims.count}
                      onChange={(v) => changeDimension('count', v)}
                    />
                    {(standardSavedShelf
                      ? (['lengthFeet', 'widthFeet'] as const)
                      : (['lengthFeet', 'widthFeet', 'depthFeet'] as const)
                    ).map((field) => (
                      <InputNumber
                        key={field}
                        label={
                          standardSavedShelf
                            ? field === 'lengthFeet'
                              ? 'Cabinet overall width'
                              : 'Cabinet overall height'
                            : {
                                lengthFeet: 'Length',
                                widthFeet: 'Width',
                                depthFeet: 'Depth / thickness',
                              }[field]
                        }
                        unit={dimensionUnit}
                        value={Number((dims[field] * displayFactor).toFixed(3))}
                        onChange={(v) => changeDimension(field, v)}
                      />
                    ))}
                  </div>
                  <div className="boq-stage-volume">
                    <span>{number(measured.cft)} cft</span>
                    <strong>{number(measured.m3)} m³</strong>
                  </div>
                  {['sajjas', 'shelves'].includes(category.key) &&
                    !standardSavedShelf && (
                      <BoqSmallRccSteelEditor
                        rows={dims.steelSets ?? []}
                        onChange={(steelSets) =>
                          props.onUpdateGeometry(
                            lineIndex,
                            { ...dims, steelSets },
                            line.name,
                          )
                        }
                      />
                    )}
                </div>
              );
            })}
            <div className="boq-stage-subcard">
              <h4>+ Measure {category.label}</h4>
              <InputText
                label="Item name"
                value={dimensionName}
                placeholder={category.label}
                onChange={setDimensionName}
              />
              <div className="boq-stage-input-grid">
                <InputNumber
                  label="Same items (nos)"
                  value={dimensionDraft.count}
                  onChange={(value) =>
                    setDimensionDraft((prior) => ({
                      ...prior,
                      count: Math.round(value),
                    }))
                  }
                />
                {(isStandardShelves
                  ? (['lengthFeet', 'widthFeet'] as const)
                  : (['lengthFeet', 'widthFeet', 'depthFeet'] as const)
                ).map((field) => (
                  <InputNumber
                    key={field}
                    label={
                      isStandardShelves
                        ? field === 'lengthFeet'
                          ? 'Cabinet overall width'
                          : 'Cabinet overall height'
                        : {
                            lengthFeet: 'Length',
                            widthFeet: 'Width',
                            depthFeet: 'Depth / thickness',
                          }[field]
                    }
                    unit={dimensionUnit}
                    value={Number(
                      (dimensionDraft[field] * displayFactor).toFixed(3),
                    )}
                    onChange={(v) => geometryValue(field, v)}
                  />
                ))}
              </div>
              <div className="boq-stage-volume">
                <span>{number(volume.cft)} cft</span>
                <strong>{number(volume.m3)} m³</strong>
              </div>
              {isStandardShelves && (
                <p className="boq-stage-hint">
                  Standard allowance: {STANDARD_SHELF_ASSUMPTIONS.depthFeet} ft
                  depth, {STANDARD_SHELF_ASSUMPTIONS.panelThicknessIn} in cement
                  panels, one shelf every{' '}
                  {STANDARD_SHELF_ASSUMPTIONS.horizontalSpacingFeet} ft and a
                  vertical bay every{' '}
                  {STANDARD_SHELF_ASSUMPTIONS.verticalBayWidthFeet} ft. Cement,
                  sand, aggregate, formwork and provisional 8 mm reinforcement
                  are calculated automatically. Verify thickness and
                  reinforcement with the structural engineer.
                </p>
              )}
              {['sajjas', 'shelves'].includes(category.key) &&
                !isStandardShelves && (
                  <BoqSmallRccSteelEditor
                    rows={dimensionDraft.steelSets ?? []}
                    onChange={(steelSets) =>
                      setDimensionDraft((previous) => ({
                        ...previous,
                        steelSets,
                      }))
                    }
                  />
                )}
              <button
                type="button"
                className="boq-stage-outline"
                disabled={volume.m3 <= 0}
                onClick={() => {
                  props.onAddGeometry(
                    stage,
                    category.key as MeasuredKind,
                    dimensionName.trim() || category.label,
                    {
                      ...dimensionDraft,
                      ...(isStandardShelves ? { shelfStandard: true } : {}),
                    },
                  );
                  setDimensionDraft({
                    count: 1,
                    lengthFeet: 0,
                    widthFeet: 0,
                    depthFeet: 0,
                    steelSets: [],
                  });
                  setDimensionName('');
                }}
              >
                + Add measured {category.label}
              </button>
            </div>
          </div>
        )}
        {category.key === 'brickwork' && floor && (
          <div className="boq-stage-dimensions">
            {walls.some((wall) => wall.location === 'external') &&
              props.floors.some(
                (floor) => floor.name !== stage && !isPenthouseFloor(floor),
              ) && (
                <button
                  type="button"
                  className="boq-stage-outline"
                  onClick={() =>
                    props.onCountsChange({
                      ...props.counts,
                      walls: copyExteriorWallsToFullFloors(
                        props.floors,
                        props.counts.walls,
                        stage,
                      ),
                    })
                  }
                >
                  Copy measured external walls to other full floors
                </button>
              )}
            {walls.map((wall, wallIndex) => {
              const updateWall = (patch: Partial<WallMeasure>) =>
                updateWalls(
                  walls.map((row, i) =>
                    i === wallIndex ? { ...row, ...patch } : row,
                  ),
                );
              return (
                <div className="boq-stage-subcard" key={wall.id}>
                  <div className="boq-stage-subhead">
                    <strong>{wall.name || 'Wall ' + (wallIndex + 1)}</strong>
                    <button
                      type="button"
                      onClick={() =>
                        updateWalls(walls.filter((_, i) => i !== wallIndex))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="boq-stage-input-grid">
                    <InputText
                      label="Wall reference"
                      value={wall.name}
                      onChange={(v) => updateWall({ name: v })}
                    />
                    <label className="boq-stage-field">
                      <span>Wall location</span>
                      <select
                        value={wall.location}
                        onChange={(e) =>
                          updateWall({
                            location:
                              e.target.value === 'internal'
                                ? 'internal'
                                : 'external',
                          })
                        }
                      >
                        <option value="external">External</option>
                        <option value="internal">Internal</option>
                      </select>
                    </label>
                    <InputNumber
                      label="Same walls (nos)"
                      value={wall.count}
                      onChange={(v) => updateWall({ count: Math.round(v) })}
                    />
                    <InputNumber
                      label="Length"
                      unit="ft"
                      value={wall.lengthFeet}
                      onChange={(v) => updateWall({ lengthFeet: v })}
                    />
                    <InputNumber
                      label="Height"
                      unit="ft"
                      value={wall.heightFeet}
                      onChange={(v) => updateWall({ heightFeet: v })}
                    />
                    <InputNumber
                      label="Thickness"
                      unit="in"
                      value={wall.thicknessIn}
                      onChange={(v) => updateWall({ thicknessIn: v })}
                    />
                  </div>
                  <div className="boq-stage-volume">
                    <span>Gross wall area</span>
                    <strong>
                      {number(wall.count * wall.lengthFeet * wall.heightFeet)}{' '}
                      sqft
                    </strong>
                  </div>
                </div>
              );
            })}
            <div className="boq-stage-subcard">
              <h4>+ Add wall type</h4>
              <div className="boq-stage-input-grid">
                <InputText
                  label="Wall reference"
                  value={wallDraft.name}
                  placeholder="W1, internal room 2"
                  onChange={(v) =>
                    setWallDraft((prior) => ({ ...prior, name: v }))
                  }
                />
                <label className="boq-stage-field">
                  <span>Wall location</span>
                  <select
                    value={wallDraft.location}
                    onChange={(e) =>
                      setWallDraft((prior) => ({
                        ...prior,
                        location:
                          e.target.value === 'internal'
                            ? 'internal'
                            : 'external',
                        thicknessIn: e.target.value === 'internal' ? 4.5 : 9,
                      }))
                    }
                  >
                    <option value="external">External</option>
                    <option value="internal">Internal</option>
                  </select>
                </label>
                <InputNumber
                  label="Same walls (nos)"
                  value={wallDraft.count}
                  onChange={(v) =>
                    setWallDraft((prior) => ({
                      ...prior,
                      count: Math.round(v),
                    }))
                  }
                />
                <InputNumber
                  label="Length"
                  unit="ft"
                  value={wallDraft.lengthFeet}
                  onChange={(v) =>
                    setWallDraft((prior) => ({ ...prior, lengthFeet: v }))
                  }
                />
                <InputNumber
                  label="Height"
                  unit="ft"
                  value={wallDraft.heightFeet}
                  onChange={(v) =>
                    setWallDraft((prior) => ({ ...prior, heightFeet: v }))
                  }
                />
                <InputNumber
                  label="Thickness"
                  unit="in"
                  value={wallDraft.thicknessIn}
                  onChange={(v) =>
                    setWallDraft((prior) => ({ ...prior, thicknessIn: v }))
                  }
                />
              </div>
              <button
                className="boq-stage-outline"
                type="button"
                disabled={
                  !(
                    wallDraft.lengthFeet > 0 &&
                    wallDraft.heightFeet > 0 &&
                    wallDraft.count > 0
                  )
                }
                onClick={() => {
                  updateWalls([
                    ...walls,
                    {
                      ...wallDraft,
                      id: 'wall-' + Date.now().toString(36),
                      name:
                        wallDraft.name.trim() || 'Wall ' + (walls.length + 1),
                    },
                  ]);
                  setWallDraft({
                    id: 'new',
                    name: '',
                    location: 'external',
                    count: 1,
                    lengthFeet: 0,
                    heightFeet: 0,
                    thicknessIn: 9,
                  });
                }}
              >
                + Add measured wall
              </button>
            </div>
          </div>
        )}
        {isFootings && (
          <BoqFootingEditor
            footings={drawing.footings ?? []}
            columnLabels={drawing.columns.map((col) => col.label)}
            onChange={setFootings}
          />
        )}
        {isColumns && (
          <>
            {drawing.columns.map((col, ci) => (
              <div className="boq-stage-subcard" key={ci}>
                <div className="boq-stage-subhead">
                  <strong>{col.label || 'Column ' + (ci + 1)}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setColumns(drawing.columns.filter((_, i) => i !== ci))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="boq-stage-input-grid">
                  <InputText
                    label="Type"
                    value={col.label}
                    onChange={(value) => updateCol(ci, { label: value })}
                  />
                  <InputNumber
                    label="Same columns (nos)"
                    value={col.count}
                    onChange={(value) =>
                      updateCol(ci, { count: Math.round(value) })
                    }
                  />
                  <InputNumber
                    label="Rises to floor (0 = all)"
                    value={col.floors}
                    onChange={(value) =>
                      updateCol(ci, { floors: Math.round(value) })
                    }
                  />
                  <InputNumber
                    label="Column width"
                    unit="in"
                    value={col.widthIn}
                    onChange={(value) => updateCol(ci, { widthIn: value })}
                  />
                  <InputNumber
                    label="Column depth"
                    unit="in"
                    value={col.depthIn}
                    onChange={(value) => updateCol(ci, { depthIn: value })}
                  />
                  <div className="boq-beam-rebar-groups">
                    <strong>Main reinforcement (per column)</strong>
                    <BarsPicker
                      label={col.label + ' reinforcement'}
                      value={col.bars}
                      onChange={(bars) => updateCol(ci, { bars })}
                    />
                  </div>
                  <InputNumber
                    label="Ring diameter"
                    unit="mm"
                    value={col.tieDia}
                    onChange={(value) => updateCol(ci, { tieDia: value })}
                  />
                  <InputNumber
                    label="Ring spacing"
                    unit="in"
                    value={col.tieSpacingIn}
                    onChange={(value) => updateCol(ci, { tieSpacingIn: value })}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="boq-stage-outline"
              onClick={() =>
                setColumns([
                  ...drawing.columns,
                  newColumn(drawing.columns.length),
                ])
              }
            >
              + Add column type
            </button>
          </>
        )}
        {isBeams && (
          <>
            {drawing.beams.map((beam, bi) => (
              <div className="boq-stage-subcard" key={bi}>
                <div className="boq-stage-subhead">
                  <strong>{beam.label}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setBeams(drawing.beams.filter((_, i) => i !== bi))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="boq-stage-input-grid">
                  <InputText
                    label="Beam type"
                    value={beam.label}
                    onChange={(value) => updateBeam(bi, { label: value })}
                  />
                  <InputNumber
                    label="Width"
                    unit="in"
                    value={beam.widthIn}
                    onChange={(value) => updateBeam(bi, { widthIn: value })}
                  />
                  <InputNumber
                    label="Depth"
                    unit="in"
                    value={beam.depthIn}
                    onChange={(value) => updateBeam(bi, { depthIn: value })}
                  />
                  <div className="boq-beam-rebar-groups">
                    <strong>Main reinforcement (per beam)</strong>
                    <BarsPicker
                      label={beam.label + ' reinforcement'}
                      value={beam.bars}
                      onChange={(bars) => updateBeam(bi, { bars })}
                    />
                  </div>
                  <InputNumber
                    label="Stirrup diameter"
                    unit="mm"
                    value={beam.stirrupDia}
                    onChange={(value) => updateBeam(bi, { stirrupDia: value })}
                  />
                  <InputNumber
                    label="Stirrup spacing"
                    unit="in"
                    value={beam.stirrupSpacingIn}
                    onChange={(value) =>
                      updateBeam(bi, { stirrupSpacingIn: value })
                    }
                  />
                  <InputNumber
                    label="Same beams on this floor (nos, 0 = legacy total run)"
                    value={beam.countsByFloor?.[index] ?? 0}
                    onChange={(value) => {
                      const newCount = Math.max(0, Math.round(value));
                      const oldCount = beam.countsByFloor?.[index] ?? 0;
                      updateBeam(bi, {
                        countsByFloor: props.floors.map((_, i) =>
                          i === index
                            ? newCount
                            : (beam.countsByFloor?.[i] ?? 0),
                        ),
                        runFeet: props.floors.map((_, i) =>
                          i === index
                            ? beamTotalRunAfterCountChange(
                                beam.runFeet[i] ?? 0,
                                oldCount,
                                newCount,
                              )
                            : (beam.runFeet[i] ?? 0),
                        ),
                      });
                    }}
                  />
                  <InputNumber
                    label={
                      beam.countsByFloor?.[index]
                        ? 'Each beam length'
                        : 'Total beam running length'
                    }
                    unit="ft"
                    value={
                      beam.countsByFloor?.[index]
                        ? (beam.runFeet[index] ?? 0) /
                          beam.countsByFloor[index]!
                        : (beam.runFeet[index] ?? 0)
                    }
                    onChange={(value) =>
                      updateBeam(bi, {
                        runFeet: props.floors.map((_, i) =>
                          i === index
                            ? value * (beam.countsByFloor?.[index] || 1)
                            : (beam.runFeet[i] ?? 0),
                        ),
                      })
                    }
                  />
                  {(beam.countsByFloor?.[index] ?? 0) > 0 && (
                    <small className="boq-structural-inline-total">
                      {number(beam.runFeet[index] ?? 0)} rft total
                    </small>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="boq-stage-outline"
              onClick={() =>
                setBeams([
                  ...drawing.beams,
                  newBeam(drawing.beams.length, props.floors.length),
                ])
              }
            >
              + Add beam type
            </button>
          </>
        )}
        {category.key === 'plinth' && (
          <div className="boq-plinth-schedule">
            {plinthRows.map((beam, bi) => (
              <section className="boq-stage-subcard" key={bi}>
                <div className="boq-stage-subhead">
                  <strong>{beam.label || `PB${bi + 1}`}</strong>
                  <button
                    type="button"
                    aria-label={`Remove plinth beam type ${bi + 1}`}
                    onClick={() =>
                      setPlinthBeams(plinthRows.filter((_, i) => i !== bi))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="boq-stage-input-grid">
                  <InputText
                    label="Beam type"
                    value={beam.label}
                    onChange={(label) => updatePlinth(bi, { label })}
                  />
                  <InputNumber
                    label="Identical beams (nos)"
                    value={beam.count}
                    onChange={(count) =>
                      updatePlinth(bi, { count: Math.round(count) })
                    }
                  />
                  <InputNumber
                    label="Each beam length"
                    unit="ft"
                    value={beam.lengthFeet}
                    onChange={(lengthFeet) => updatePlinth(bi, { lengthFeet })}
                  />
                  <InputNumber
                    label="Beam width"
                    unit="in"
                    value={beam.widthIn}
                    onChange={(widthIn) => updatePlinth(bi, { widthIn })}
                  />
                  <InputNumber
                    label="Beam depth"
                    unit="in"
                    value={beam.depthIn}
                    onChange={(depthIn) => updatePlinth(bi, { depthIn })}
                  />
                  <div className="boq-beam-rebar-groups">
                    <strong>Main reinforcement (per beam)</strong>
                    <BarsPicker
                      label={`Plinth ${beam.label || `PB${bi + 1}`}`}
                      value={beam.bars}
                      onChange={(bars) => updatePlinth(bi, { bars })}
                    />
                  </div>
                  <InputNumber
                    label="Stirrup diameter"
                    unit="mm"
                    value={beam.stirrupDia}
                    onChange={(stirrupDia) => updatePlinth(bi, { stirrupDia })}
                  />
                  <InputNumber
                    label="Stirrup spacing"
                    unit="in"
                    value={beam.stirrupSpacingIn}
                    onChange={(stirrupSpacingIn) =>
                      updatePlinth(bi, { stirrupSpacingIn })
                    }
                  />
                </div>
                <small className="boq-plinth-run">
                  {number(beam.count * beam.lengthFeet)} rft total · Concrete
                  and each steel diameter calculated once
                </small>
              </section>
            ))}
            <button
              type="button"
              className="boq-stage-outline"
              onClick={() =>
                setPlinthBeams([
                  ...plinthRows,
                  {
                    label: `PB${plinthRows.length + 1}`,
                    count: 1,
                    lengthFeet: 0,
                    widthIn:
                      drawing.settings?.plinthBeamWidthIn ??
                      props.structuralSettings.plinthBeamWidthIn ??
                      9,
                    depthIn:
                      drawing.settings?.plinthBeamDepthIn ??
                      props.structuralSettings.plinthBeamDepthIn ??
                      12,
                    bars: '',
                    stirrupDia:
                      drawing.settings?.plinthBeamStirrupDia ??
                      props.structuralSettings.plinthBeamStirrupDia ??
                      8,
                    stirrupSpacingIn:
                      drawing.settings?.plinthBeamStirrupSpacingIn ??
                      props.structuralSettings.plinthBeamStirrupSpacingIn ??
                      6,
                  },
                ])
              }
            >
              + Add plinth beam type
            </button>
          </div>
        )}
        {category.key === 'slab' && (
          <>
            <BoqSlabScheduleEditor
              floor={stage}
              panels={(drawing.slabPanels ?? []).filter(
                (panel) => panel.floor === stage,
              )}
              onChange={(panels) => setSlabPanels(stage, panels)}
            />
            {!drawing.slabPanels?.some((panel) => panel.floor === stage) && (
              <div className="boq-stage-input-grid">
                {floor && (
                  <>
                    <InputNumber
                      label="Length"
                      unit="ft"
                      value={floor.lengthFeet}
                      onChange={(value) =>
                        props.onFloorChange(
                          props.floors.map((f, i) =>
                            i === index ? { ...f, lengthFeet: value } : f,
                          ),
                        )
                      }
                    />
                    <InputNumber
                      label="Width"
                      unit="ft"
                      value={floor.widthFeet}
                      onChange={(value) =>
                        props.onFloorChange(
                          props.floors.map((f, i) =>
                            i === index ? { ...f, widthFeet: value } : f,
                          ),
                        )
                      }
                    />
                    <InputNumber
                      label="Floor height"
                      unit="ft"
                      value={floor.heightFeet}
                      onChange={(value) =>
                        props.onFloorChange(
                          props.floors.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  heightFeet: value,
                                  heightAssumed: false,
                                }
                              : f,
                          ),
                        )
                      }
                    />
                  </>
                )}
                {fieldFor(
                  'slabThicknessIn',
                  'Slab thickness',
                  SLAB_FIELD_DEFAULTS.slabThicknessIn,
                )}
                {fieldFor(
                  'slabMainDia',
                  'Main bar diameter',
                  SLAB_FIELD_DEFAULTS.slabMainDia,
                  'mm',
                )}
                {fieldFor(
                  'slabMainSpacingIn',
                  'Main bar spacing',
                  SLAB_FIELD_DEFAULTS.slabMainSpacingIn,
                )}
                {fieldFor(
                  'slabDistDia',
                  'Distribution bar',
                  SLAB_FIELD_DEFAULTS.slabDistDia,
                  'mm',
                )}
                {fieldFor(
                  'slabDistSpacingIn',
                  'Distribution spacing',
                  SLAB_FIELD_DEFAULTS.slabDistSpacingIn,
                )}
                {!slabConfirmed && (
                  <button
                    type="button"
                    className="boq-stage-outline"
                    onClick={() =>
                      props.onDesignChange({
                        ...drawing,
                        settings: {
                          ...drawing.settings,
                          ...shownSlabSettings(),
                        },
                      })
                    }
                  >
                    Confirm slab details
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {category.key === 'staircase' && (
          <>
            <BoqStaircaseScheduleEditor
              floor={stage}
              stairs={(drawing.staircases ?? []).filter(
                (stair) => stair.floor === stage,
              )}
              onChange={(stairs) => setStairs(stage, stairs)}
            />
            {!drawing.staircases?.some((stair) => stair.floor === stage) && (
              <div className="boq-stage-input-grid">
                {fieldFor('stairWidthFeet', 'Stair width', 3.5, 'ft')}
                {fieldFor('stairRiserIn', 'Riser', 6)}
                {fieldFor('stairTreadIn', 'Tread', 10)}
                {fieldFor('stairWaistIn', 'Waist slab', 6)}
                {fieldFor('stairMainDia', 'Main bar', 12, 'mm')}
                {fieldFor('stairBarSpacingIn', 'Bar spacing', 6)}
              </div>
            )}
          </>
        )}
        {current && category.key === 'doors' && (
          <div className="boq-stage-input-grid">
            {(
              [
                ['mainDoors', 'Main doors'],
                ['internalDoors', 'Internal doors'],
                ['bathroomDoors', 'Bathroom doors'],
                ['poojaDoors', 'Pooja doors'],
                ['windows', 'Windows'],
                ['ventilators', 'Ventilators'],
                ['rollingShutters', 'Rolling shutters'],
              ] as const
            ).map(([key, label]) => (
              <InputNumber
                key={key}
                label={label ?? ''}
                value={current[key as keyof typeof current]}
                onChange={(value) =>
                  changeCount(key as keyof typeof current, value)
                }
              />
            ))}
          </div>
        )}
        {current && category.key === 'tiles' && (
          <div className="boq-stage-dimensions">
            <h4>Flooring & kitchens</h4>
            <div className="boq-stage-input-grid">
              <InputNumber
                label="Room flooring area"
                unit="sqft"
                value={finishes?.roomFlooringSqft ?? 0}
                onChange={(value) =>
                  changeFinishes({ roomFlooringSqft: value, rooms: [] })
                }
              />
              <InputNumber
                label="Parking flooring area"
                unit="sqft"
                value={finishes?.parkingFlooringSqft ?? 0}
                onChange={(value) =>
                  changeFinishes({ parkingFlooringSqft: value })
                }
              />
              <InputText
                label="Bathroom sizes (L × W, ft)"
                value={finishes?.bathroomSizes ?? ''}
                placeholder="7×5, 6×4"
                onChange={(value) => changeFinishes({ bathroomSizes: value })}
              />
              <InputNumber
                label="Bathroom wall tile height"
                unit="ft"
                value={finishes?.bathroomTileHeightFeet ?? 0}
                onChange={(value) =>
                  changeFinishes({ bathroomTileHeightFeet: value })
                }
              />
              <InputNumber
                label="Tile & granite wastage"
                unit="%"
                value={
                  finishes?.tileWastagePercent ??
                  finishDefaults.tileWastagePercent
                }
                onChange={(value) =>
                  changeFinishes({
                    tileWastagePercent: Math.max(0, Math.min(30, value)),
                  })
                }
              />
            </div>
            <label className="boq-stage-scope-toggle">
              <input
                type="checkbox"
                checked={finishes?.excludeRoomFlooring === true}
                onChange={(event) =>
                  changeFinishes({ excludeRoomFlooring: event.target.checked })
                }
              />
              No room floor tiles on this floor
            </label>
            {measuredKitchens.map((kitchen, kitchenIndex) => {
              const update = (patch: Partial<typeof kitchen>) =>
                updateKitchens(
                  measuredKitchens.map((row, i) =>
                    i === kitchenIndex ? { ...row, ...patch } : row,
                  ),
                );
              return (
                <div className="boq-stage-subcard" key={kitchen.id}>
                  <div className="boq-stage-subhead">
                    <strong>
                      {kitchen.name || 'Kitchen ' + (kitchenIndex + 1)}
                    </strong>
                    <button
                      type="button"
                      onClick={() =>
                        updateKitchens(
                          measuredKitchens.filter((_, i) => i !== kitchenIndex),
                        )
                      }
                    >
                      Remove kitchen
                    </button>
                  </div>
                  <div className="boq-stage-input-grid">
                    <InputText
                      label="Kitchen reference"
                      value={kitchen.name}
                      onChange={(value) => update({ name: value })}
                    />
                    <InputNumber
                      label="Platform length"
                      unit="ft"
                      value={kitchen.platformFeet}
                      onChange={(value) => update({ platformFeet: value })}
                    />
                    <InputNumber
                      label="Granite depth"
                      unit="ft"
                      value={kitchen.platformDepthFeet}
                      onChange={(value) => update({ platformDepthFeet: value })}
                    />
                    <InputNumber
                      label="Wall tile length"
                      unit="ft"
                      value={kitchen.wallTileFeet}
                      onChange={(value) => update({ wallTileFeet: value })}
                    />
                    <InputNumber
                      label="Wall tile height"
                      unit="ft"
                      value={kitchen.wallTileHeightFeet}
                      onChange={(value) =>
                        update({ wallTileHeightFeet: value })
                      }
                    />
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="boq-stage-outline"
              onClick={() =>
                updateKitchens([
                  ...measuredKitchens,
                  {
                    id: 'kitchen-' + Date.now().toString(36),
                    name: 'Kitchen ' + (measuredKitchens.length + 1),
                    platformFeet: 0,
                    platformDepthFeet: 0,
                    wallTileFeet: 0,
                    wallTileHeightFeet: 0,
                  },
                ])
              }
            >
              ＋ Add kitchen
            </button>
          </div>
        )}
        {floor && category.key === 'staircase' && (
          <div className="boq-stage-dimensions">
            <h4>Staircase finishes on {stage}</h4>
            <div className="boq-stage-input-grid">
              <InputNumber
                label="Staircase granite"
                unit="sqft"
                value={finishes?.staircaseGraniteSqft ?? 0}
                onChange={(value) =>
                  changeFinishes({ staircaseGraniteSqft: value })
                }
              />
              <InputNumber
                label="SS railing"
                unit="rft"
                value={finishes?.railingFeet ?? 0}
                onChange={(value) => changeFinishes({ railingFeet: value })}
              />
            </div>
          </div>
        )}
        {current && category.key === 'painting' && (
          <div className="boq-stage-input-grid">
            <InputNumber
              label="Ceiling painting area"
              unit="sqft"
              value={finishes?.ceilingPaintSqft ?? 0}
              onChange={(value) => changeFinishes({ ceilingPaintSqft: value })}
            />
          </div>
        )}
        {current && category.key === 'plaster' && (
          <div className="boq-stage-dimensions">
            <h4>Plastering from measured walls — {stage}</h4>
            <div className="boq-stage-input-grid">
              <label className="boq-stage-field">
                <span>Internal plaster coats</span>
                <select
                  value={finishes?.internalPlasterCoats ?? 1}
                  onChange={(event) =>
                    changeFinishes({
                      internalPlasterCoats: event.target.value === '2' ? 2 : 1,
                    })
                  }
                >
                  <option value={1}>Single coat</option>
                  <option value={2}>Double coat</option>
                </select>
              </label>
              <label className="boq-stage-field">
                <span>External plaster coats</span>
                <select
                  value={finishes?.externalPlasterCoats ?? 1}
                  onChange={(event) =>
                    changeFinishes({
                      externalPlasterCoats: event.target.value === '2' ? 2 : 1,
                    })
                  }
                >
                  <option value={1}>Single coat</option>
                  <option value={2}>Double coat</option>
                </select>
              </label>
            </div>
            {!props.counts.walls?.[stage]?.length && (
              <p className="boq-guided-warning" role="status">
                Wall measurements pending.
              </p>
            )}
          </div>
        )}
        {current && category.key === 'plumbing' && (
          <div className="boq-stage-dimensions">
            <h4>Plumbing scope for {stage}</h4>
            <div className="boq-stage-input-grid">
              <InputNumber
                label="Bathrooms"
                value={current.bathrooms}
                onChange={(value) => changeCount('bathrooms', value)}
              />
              <InputNumber
                label="Kitchens"
                value={current.kitchens}
                onChange={(value) => {
                  if (finishes?.kitchenMeasurements)
                    updateKitchens(
                      Array.from(
                        { length: Math.round(value) },
                        (_, i) =>
                          measuredKitchens[i] ?? {
                            id: 'kitchen-' + Date.now().toString(36) + '-' + i,
                            name: 'Kitchen ' + (i + 1),
                            platformFeet: 0,
                            platformDepthFeet: 0,
                            wallTileFeet: 0,
                            wallTileHeightFeet: 0,
                          },
                      ),
                    );
                  else changeCount('kitchens', value);
                }}
              />
            </div>
          </div>
        )}
        {current && category.key === 'electrical' && (
          <div className="boq-stage-dimensions">
            <h4>Electrical points on {stage}</h4>
            <div className="boq-stage-input-grid">
              {(
                [
                  ['lightPoints', 'Light points'],
                  ['fanPoints', 'Fan points'],
                  ['socketPoints', 'Sockets'],
                  ['powerPoints', '16A power points'],
                ] as const
              ).map(([key, label]) => (
                <InputNumber
                  key={key}
                  label={label}
                  value={current[key]}
                  onChange={(value) => changeCount(key, value)}
                />
              ))}
            </div>
          </div>
        )}
        {current &&
          (category.key === 'electrical' || category.key === 'plumbing') && (
            <div className="boq-stage-dimensions">
              <h4>Measured materials</h4>
              <div className="boq-stage-input-grid">
                {MEASURED_SERVICE_FIELDS.filter(
                  (field) => field.group === category.key,
                ).map((field) => (
                  <InputNumber
                    key={field.material}
                    label={field.name}
                    unit={field.inputUnit}
                    value={finishes?.serviceMeasurements?.[field.material] ?? 0}
                    onChange={(value) =>
                      changeFinishes({
                        serviceMeasurements: {
                          ...finishes?.serviceMeasurements,
                          [field.material]:
                            field.inputUnit === 'nos' ||
                            field.inputUnit === 'lot'
                              ? Math.round(value)
                              : value,
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        {current && category.key === 'doors' && (
          <div className="boq-stage-subcard">
            <h4>Door, window and ventilator sizes from drawing</h4>
            <div className="boq-stage-input-grid">
              {(
                [
                  ['mainDoors', 'Main doors (external)'],
                  ['internalDoors', 'Room doors (internal)'],
                  ['bathroomDoors', 'Bathroom doors (internal)'],
                  ['poojaDoors', 'Pooja doors (internal)'],
                  ['ventilators', 'Ventilators (external)'],
                  ['rollingShutters', 'Rolling shutters (external)'],
                ] as const
              ).map(([key, label]) => (
                <InputText
                  key={key}
                  label={label}
                  value={props.counts.doorSizes?.[stage]?.[key] ?? ''}
                  placeholder="e.g. 2×3×7"
                  onChange={(value) =>
                    props.onCountsChange({
                      ...props.counts,
                      doorSizes: {
                        ...props.counts.doorSizes,
                        [stage]: {
                          ...props.counts.doorSizes?.[stage],
                          [key]: value,
                        },
                      },
                    })
                  }
                />
              ))}
              <InputText
                label="Windows (nos × W × H, ft)"
                value={props.counts.windowSizes?.[stage] ?? ''}
                placeholder="e.g. 2×4×4, 3×4×5"
                onChange={(value) =>
                  props.onCountsChange({
                    ...props.counts,
                    windowSizes: {
                      ...props.counts.windowSizes,
                      [stage]: value,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
        {current && category.key === 'penthouse' && stage === last && (
          <div className="boq-stage-subcard">
            <h4>Penthouse / Headroom</h4>
            <InputNumber
              label="Built-up area included in this floor (sq ft)"
              value={props.floors.at(-1)?.penthouseSqft ?? 0}
              onChange={(value) =>
                props.onFloorChange(
                  props.floors.map((floor, index) =>
                    index === props.floors.length - 1
                      ? {
                          ...floor,
                          penthouseSqft: Math.min(
                            Math.max(0, value),
                            Math.max(0, floor.areaSqft),
                          ),
                        }
                      : floor,
                  ),
                )
              }
            />
          </div>
        )}
        {current && category.key === 'compound' && (
          <div className="boq-stage-input-grid">
            <InputNumber
              label="Compound wall length"
              unit="ft"
              value={props.counts.compoundWallFeet}
              onChange={(value) =>
                props.onCountsChange({
                  ...props.counts,
                  compoundWallFeet: value,
                })
              }
            />
          </div>
        )}
        {foundEntries.some(
          (entry) => entry.line.kind !== 'measured-geometry',
        ) &&
          !isColumns &&
          !isBeams && (
            <>
              <h4>Calculated materials & labour</h4>
              <div className="boq-stage-output-rows">
                {foundEntries
                  .filter((entry) => entry.line.kind !== 'measured-geometry')
                  .map((entry) => (
                    <div
                      className="boq-stage-output"
                      key={entry.line.id + '-' + entry.outputIndex}
                    >
                      <span>
                        {entry.output.name}
                        <small>{entry.line.name}</small>
                      </span>
                      {isDerivedQuantityReadOnly(
                        entry.line.kind,
                        entry.output.name,
                      ) ? (
                        <div className="boq-stage-field">
                          <span>Calculated quantity ({entry.output.unit})</span>
                          <strong>{number(entry.output.quantity)}</strong>
                        </div>
                      ) : (
                        <InputNumber
                          label="Quantity"
                          value={entry.output.quantity}
                          unit={entry.output.unit}
                          onChange={(value) =>
                            props.onUpdateQuantity(
                              entry.lineIndex,
                              entry.outputIndex,
                              value,
                            )
                          }
                        />
                      )}
                      {entry.output.quotedRate !== undefined && (
                        <small className="boq-stage-limit">
                          Quote limit:
                          {money(entry.output.quotedRate)} / {entry.output.unit}
                        </small>
                      )}
                      {entry.line.origin &&
                      entry.output.material === 'concrete_m20' ? (
                        props.canViewCost && (
                          <small className="boq-stage-limit">
                            M20 RMC rate: {money(props.structuralRmcRate)} / m³
                          </small>
                        )
                      ) : props.isOldLabourOutput?.(entry.output) ? (
                        <small className="boq-stage-limit">
                          Included in labour package
                        </small>
                      ) : (
                        props.canViewCost && (
                          <InputNumber
                            label="Rate"
                            value={
                              entry.output.rate ?? props.rateFor(entry.output)
                            }
                            onChange={(value) =>
                              props.onUpdateRate(
                                entry.lineIndex,
                                entry.outputIndex,
                                value,
                              )
                            }
                          />
                        )
                      )}
                      {!entry.line.origin ? (
                        <button
                          type="button"
                          onClick={() => props.onRemoveManual(entry.lineIndex)}
                        >
                          Remove
                        </button>
                      ) : (
                        !isDerivedQuantityReadOnly(
                          entry.line.kind,
                          entry.output.name,
                        ) &&
                        [
                          'tiles',
                          'painting',
                          'plumbing',
                          'electrical',
                          'staircase',
                          'plaster',
                          'waterproofing',
                          'doors',
                        ].includes(category.key) && (
                          <button
                            type="button"
                            onClick={() =>
                              entry.output.quantity === 0
                                ? props.onResetQuantity(
                                    entry.lineIndex,
                                    entry.outputIndex,
                                  )
                                : props.onUpdateQuantity(
                                    entry.lineIndex,
                                    entry.outputIndex,
                                    0,
                                  )
                            }
                          >
                            {entry.output.quantity === 0
                              ? 'Restore calculated quantity'
                              : 'Remove from floor'}
                          </button>
                        )
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
      </div>
    );
  };

  const renderCategoryTile = (stage: string, category: Category) => {
    const entries = entriesFor(stage, category.key);
    const measured =
      entries.some(({ output }) => output.quantity > 0) ||
      (category.key === 'penthouse' &&
        Boolean(props.floors.at(-1)?.penthouseSqft)) ||
      (category.key === 'footings' && isMeasuredFooting(props.design)) ||
      (category.key === 'columns' && isMeasuredColumn(props.design)) ||
      (category.key === 'plinth' &&
        Boolean(
          props.design?.plinthBeams?.length
            ? props.design.plinthBeams.some(
                (beam) =>
                  beam.count > 0 &&
                  beam.lengthFeet > 0 &&
                  parseBars(beam.bars).length > 0,
              )
            : props.design?.plinthRunFeet,
        ));
    const pending = unmeasured(stage, category.key);
    const combined =
      category.key === 'beams' &&
      entriesFor(stage, 'slab').some(
        (entry) => entry.line.kind === 'quote-slab',
      );
    return (
      <div className="boq-stage-tile" key={category.key}>
        <span className="boq-stage-tile-icon" aria-hidden="true">
          {category.icon}
        </span>
        <div className="boq-stage-tile-body">
          <strong>{category.label}</strong>
          <small
            className={measured && !pending ? 'boq-stage-entered' : 'pending'}
          >
            {combined && !measured
              ? 'Included with slab'
              : measured && !pending
                ? 'Entered'
                : 'Not entered'}
          </small>
        </div>
        {props.canViewCost && (
          <strong className="boq-premium-work-cost">
            {money(visibleCost(stage, category.key))}
          </strong>
        )}
        <button
          type="button"
          aria-expanded={
            editing?.stage === stage && editing.category === category.key
          }
          className="boq-stage-tile-edit"
          aria-label={'View or edit ' + category.label + ' on ' + stage}
          onClick={() => openEditor(stage, category.key)}
        >
          {editing?.stage === stage && editing.category === category.key
            ? 'Close'
            : measured
              ? 'View / Edit'
              : '+ Add Item'}
        </button>
      </div>
    );
  };

  const previewGroups = measurementScreen
    ? guidedSections.flatMap((stage) => {
        const categories =
          stage === 'Foundation'
            ? foundation
            : stage === last
              ? terrace
              : standard;
        return categories
          .filter(
            (category) =>
              selectedWizard.categories.includes(category.key) &&
              (category.key !== 'compound' || stage === props.floors[0]?.name),
          )
          .map((category) => ({
            stage,
            key: category.key,
            label: category.label,
            entries: entriesFor(stage, category.key),
            pending:
              unmeasured(stage, category.key) ||
              !entriesFor(stage, category.key).some(
                ({ output }) => output.quantity > 0,
              ),
          }));
      })
    : [];
  // Floor-wide extras are included in one stage preview only.
  const extraGroups =
    guidedStep === 4 || guidedStep === 11
      ? guidedSections
          .map((stage) => ({
            stage,
            key: 'miscellaneous',
            label: 'Miscellaneous',
            entries: [
              ...entriesFor(stage, 'miscellaneous'),
              ...(guidedStep === 11 ? entriesFor(stage, 'extra') : []),
            ],
            pending: false,
          }))
          .filter((group) => group.entries.length)
      : [];
  const groups = [...previewGroups, ...extraGroups];
  const previewEntries =
    guidedStep >= 12 ? mapped : groups.flatMap((group) => group.entries);
  const isLabour = (output: StageBoqOutput) =>
    props.isLabourOutput?.(output) ??
    /^labour_|^plaster_labour$/.test(output.material ?? '');
  const previewMaterial =
    guidedStep >= 12
      ? (props.projectMaterialCost ?? 0)
      : previewEntries.reduce(
          (sum, { output }) => sum + (isLabour(output) ? 0 : priced(output)),
          0,
        );
  const previewLabour =
    guidedStep >= 12
      ? (props.projectLabourCost ?? 0)
      : previewEntries.reduce(
          (sum, { output }) => sum + (isLabour(output) ? priced(output) : 0),
          0,
        );
  const missingRates = props.canViewCost
    ? previewEntries.filter(
        ({ output }) =>
          props.isUnpricedOutput?.(output) ??
          (output.quantity > 0 &&
            !props.isOldLabourOutput?.(output) &&
            !output.name.endsWith(' · volume only') &&
            props.rateFor(output) <= 0),
      )
    : [];
  const pendingGroups = previewGroups.filter((group) => group.pending);
  const pendingCount =
    pendingGroups.length +
    missingRates.length +
    (guidedStep === 2
      ? props.floors.filter(
          (floor) =>
            floor.heightAssumed ||
            !(floor.heightFeet > 0) ||
            !(floor.areaSqft > 0),
        ).length
      : 0);
  const breakdown = new Map<string, number>();
  for (const group of groups)
    breakdown.set(
      group.label,
      (breakdown.get(group.label) ?? 0) +
        group.entries.reduce((sum, { output }) => sum + priced(output), 0),
    );
  const renderPreview = () => (
    <aside className="boq-premium-preview" aria-label="Stage Preview">
      <div className="boq-premium-preview-banner">
        <span aria-hidden="true">▱</span>
        <div>
          <h3>Stage Preview</h3>
          <small>{selectedWizard.short}</small>
        </div>
        <svg viewBox="0 0 160 80" aria-hidden="true">
          <path
            d="M10 70 65 43 150 57 94 78Z M30 59V18M42 54V8M54 48V24M110 58V10M120 60V2M130 62V20M30 30 54 36M110 22 130 28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <button
        type="button"
        className={
          'boq-premium-review-status ' + (pendingCount ? 'pending' : 'ready')
        }
        onClick={() => setShowReview((old) => !old)}
        aria-expanded={showReview}
      >
        <span aria-hidden="true">{pendingCount ? '!' : '✓'}</span>
        {props.calculating
          ? 'Calculating…'
          : pendingCount
            ? pendingCount + ' items need review'
            : 'No outstanding checks for this stage'}
        <span aria-hidden="true">›</span>
      </button>
      {props.canViewCost && guidedStep !== 2 && guidedStep !== 3 && (
        <>
          <h4>Cost Summary</h4>
          <dl className="boq-premium-cost-list">
            <div>
              <dt>Material Cost</dt>
              <dd>{money(previewMaterial)}</dd>
            </div>
            <div>
              <dt>Labour Cost</dt>
              <dd>{money(previewLabour)}</dd>
            </div>
            <div className="boq-premium-total">
              <dt>
                {guidedStep >= 12 ? 'Total Project Cost' : 'Total Stage Cost'}
              </dt>
              <dd>{money(previewMaterial + previewLabour)}</dd>
            </div>
          </dl>
          {measurementScreen && (
            <>
              <h4>Breakdown (by Work)</h4>
              <dl className="boq-premium-breakdown">
                {[...breakdown].map(([label, amount]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{money(amount)}</dd>
                  </div>
                ))}
              </dl>
              {props.labourStageCosts && (
                <small className="boq-premium-package-note">
                  Contract labour included at Labour stage.
                </small>
              )}
            </>
          )}
        </>
      )}
      {guidedStep === 2 && (
        <dl className="boq-premium-breakdown">
          {props.floors.map((floor) => (
            <div key={floor.name}>
              <dt>{floor.name}</dt>
              <dd>{number(floor.areaSqft ?? 0)} sq ft</dd>
            </div>
          ))}
        </dl>
      )}
      {guidedStep === 3 && (
        <dl className="boq-premium-breakdown">
          <div>
            <dt>Concrete method</dt>
            <dd>{props.structuralRmcEnabled ? 'RMC' : 'Site mix'}</dd>
          </div>
          {props.canViewCost && props.structuralRmcEnabled && (
            <div>
              <dt>Rate / m³</dt>
              <dd>{money(props.structuralRmcRate)}</dd>
            </div>
          )}
        </dl>
      )}
      <button
        type="button"
        className="boq-premium-review-button"
        aria-expanded={showReview}
        onClick={() => setShowReview((old) => !old)}
      >
        {showReview ? 'Hide Details' : 'Review Details'}
      </button>
      {showReview && (
        <div className="boq-premium-details">
          <h4>Measurement & Rate Review</h4>
          {pendingGroups.map((group) => (
            <div
              key={group.stage + group.key}
              className="boq-premium-check-row"
            >
              <span>
                {group.stage} · {group.label}
              </span>
              <strong>Measurement pending</strong>
            </div>
          ))}
          {missingRates.map(({ line, output, outputIndex }) => (
            <div key={line.id + outputIndex} className="boq-premium-check-row">
              <span>
                {line.section} · {output.name}
              </span>
              <strong>Rate pending</strong>
            </div>
          ))}
          {props.canViewCost &&
            previewEntries
              .filter(({ output }) => output.quantity > 0)
              .map(({ line, output, outputIndex }) => (
                <div
                  className="boq-premium-check-row"
                  key={line.id + ':' + outputIndex}
                >
                  <span>
                    {line.section} · {output.name}
                    <small>
                      {number(output.quantity)} {output.unit} ×{' '}
                      {money(props.rateFor(output))}
                    </small>
                  </span>
                  <strong>{money(priced(output))}</strong>
                </div>
              ))}
          {guidedStep === 2 &&
            props.floors
              .filter(
                (floor) =>
                  floor.heightAssumed ||
                  !(floor.heightFeet > 0) ||
                  !(floor.areaSqft > 0),
              )
              .map((floor) => (
                <div key={floor.name} className="boq-premium-check-row">
                  <span>{floor.name}</span>
                  <strong>
                    {floor.heightAssumed || !(floor.heightFeet > 0)
                      ? 'Height to verify'
                      : 'Area to verify'}
                  </strong>
                </div>
              ))}
          {guidedStep !== 2 &&
            !previewEntries.length &&
            !pendingGroups.length && <small>No stage items to review.</small>}
        </div>
      )}
    </aside>
  );

  return (
    <section
      className="boq-stages boq-premium-wizard"
      aria-label="Stage-wise BOQ builder"
    >
      <header className="boq-premium-heading">
        <div className="boq-premium-title">
          <span className="boq-stage-main-icon" aria-hidden="true">
            ▥
          </span>
          <div>
            <h2>BOQ Builder</h2>
          </div>
        </div>
        <div className="boq-premium-progress">
          <strong>
            Step {stepPosition} of {BOQ_WIZARD_STEPS.length}
          </strong>
          <div
            role="progressbar"
            aria-label="Wizard position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (stepPosition / BOQ_WIZARD_STEPS.length) * 100,
            )}
            className="boq-premium-progress-track"
          >
            <span
              style={{
                width:
                  Math.round((stepPosition / BOQ_WIZARD_STEPS.length) * 100) +
                  '%',
              }}
            />
          </div>
          <strong>
            {Math.round((stepPosition / BOQ_WIZARD_STEPS.length) * 100)}%
          </strong>
        </div>
      </header>
      <BoqWizardProgress
        active={guidedStep}
        reviewed={reviewedSteps}
        onChange={goToWizard}
      />
      <div className="boq-premium-layout">
        <div className="boq-premium-entry" key={guidedStep}>
          <header className="boq-premium-stage-head">
            <h3>
              {stepPosition}. {selectedWizard.short}
            </h3>
            {props.autoSaveLabel &&
              props.autoSaveLabel !== 'Saved automatically' && (
                <span className="boq-autosave-status" role="status">
                  {props.autoSaveLabel}
                </span>
              )}
          </header>
          {guidedStep === 2 && (
            <BoqFloorProjectSetup
              floors={props.floors}
              onChange={props.onFloorChange}
              canEdit={props.canSave}
            />
          )}
          {guidedStep === 3 && (
            <BoqStructuralConcreteCard
              enabled={props.structuralRmcEnabled}
              ratePerM3={props.structuralRmcRate}
              onToggle={props.onStructuralRmcToggle}
              onRateChange={props.onStructuralRmcRateChange}
              settings={props.structuralSettings}
              canEdit={props.canSave}
              canViewCost={props.canViewCost}
              autoSaveLabel={
                props.autoSaveLabel === 'Saved automatically'
                  ? undefined
                  : props.autoSaveLabel
              }
            />
          )}
          {guidedStep === 12 && (
            <section className="boq-guided-panel boq-guided-center">
              <div className="boq-guided-panel-head">
                <div>
                  <h3>Material Rate Card</h3>
                </div>
              </div>
              {props.canViewCost && (
                <div className="boq-guided-rate-scroll">
                  <table className="boq-guided-rate-table">
                    <thead>
                      <tr>
                        <th>Material / supplier</th>
                        <th>Unit</th>
                        <th>Current rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(props.materialRates ?? [])
                        .filter(
                          (rate) =>
                            rate.category === 'material' &&
                            (!rate.variant || rate.isDefault),
                        )
                        .slice(0, 20)
                        .map((rate) => (
                          <tr key={rate.key}>
                            <td>
                              {rate.label}
                              {rate.variant ? ' · ' + rate.variant : ''}
                            </td>
                            <td>{rate.unit}</td>
                            <td>
                              {rate.rate > 0 ? money(rate.rate) : 'Not set'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {props.canViewCost && (
                <Link
                  className="boq-guided-primary"
                  href="/dashboard/execution/boq/pricing"
                >
                  Edit Material Rate Library →
                </Link>
              )}
            </section>
          )}
          {guidedStep === 13 &&
            (props.labourContent ?? (
              <section className="boq-guided-panel">
                <h3>Labour Costing</h3>
              </section>
            ))}
          {guidedStep === 14 && (
            <section className="boq-guided-panel boq-guided-center">
              <div className="boq-guided-panel-head">
                <div>
                  <h3>One Final Detailed BOQ</h3>
                </div>
              </div>
              <button
                className="boq-guided-primary"
                type="button"
                onClick={props.onDetailedBoq}
                disabled={!props.canOpenDetailed}
              >
                View Final Detailed BOQ →
              </button>
            </section>
          )}
          {measurementScreen && selectedWizard.scope === 'floors' && (
            <div
              className="boq-stage-tabs"
              role="group"
              aria-label="Jump to BOQ stage"
            >
              {guidedSections.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={activeTab === stage ? 'selected' : ''}
                  onClick={() => {
                    setActiveTab(stage);
                    setEditing(null);
                    setMiscellaneousStage(null);
                    syncFocusUrl(null);
                  }}
                >
                  {stage === last &&
                  props.floors.at(-1) &&
                  isPenthouse(props.floors.at(-1)!)
                    ? stage + ' · Penthouse'
                    : stage}
                </button>
              ))}
            </div>
          )}
          {measurementScreen &&
            guidedSections
              .filter((stage) => stage === activeTab)
              .map((stage) => {
                const stageIndex = sections.indexOf(stage);
                const isFoundation = stage === 'Foundation';
                const isTop = stage === last && !isFoundation;
                const list = isFoundation
                  ? foundation
                  : isTop
                    ? terrace
                    : standard;
                const visibleList = list.filter(
                  (item) =>
                    selectedWizard.categories.includes(item.key) &&
                    (item.key !== 'compound' ||
                      stage === props.floors[0]?.name),
                );
                const inherited = Boolean(props.repeatFrom[stage]);
                const miscellaneousRows = props.lines
                  .map((line, lineIndex) => ({ line, lineIndex }))
                  .filter(
                    ({ line }) =>
                      !line.origin &&
                      line.kind === 'manual' &&
                      stageFor(line, props.floors) === stage,
                  );
                const miscellaneousTotal = visibleCost(stage, 'miscellaneous');
                return (
                  <Fragment key={stage}>
                    {!isFoundation &&
                      stageIndex === 2 &&
                      props.floors.length > 1 && (
                        <div className="boq-stage-repeat">
                          <div className="boq-stage-repeat-title">
                            <span>▱</span>
                            <div>
                              <strong>Repeat to floors</strong>
                            </div>
                          </div>
                          <div className="boq-stage-repeat-controls">
                            <label>
                              <input
                                type="checkbox"
                                checked={repeatAll}
                                onChange={(event) =>
                                  props.onRepeatFloors(
                                    standardFloors.map((floor) => floor.name),
                                    event.target.checked,
                                  )
                                }
                              />
                              Repeat setup
                            </label>
                            <div className="boq-stage-repeat-targets">
                              {props.floors.slice(1).map((floor) => (
                                <label key={floor.name}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(
                                      props.repeatFrom[floor.name],
                                    )}
                                    onChange={(event) =>
                                      props.onRepeatFloors(
                                        [floor.name],
                                        event.target.checked,
                                      )
                                    }
                                  />
                                  {floor.name}
                                  {isPenthouse(floor)
                                    ? ' (penthouse — custom by default)'
                                    : ''}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    <article
                      className="boq-stage-card"
                      id={'boq-stage-' + stageIndex}
                    >
                      {inherited && (
                        <div className="boq-stage-customize">
                          <span>Repeated from {props.repeatFrom[stage]}</span>
                          <button
                            type="button"
                            onClick={() => props.onCustomizeFloor(stage)}
                          >
                            ✎ Customize
                          </button>
                        </div>
                      )}
                      <div
                        className={
                          isFoundation
                            ? 'boq-stage-items foundation'
                            : 'boq-stage-items'
                        }
                      >
                        {isTop && isPenthouse(props.floors.at(-1)!) && (
                          <div className="boq-penthouse-scope">
                            <strong>Penthouse</strong>
                            {Boolean(props.floors.at(-1)?.penthouseSqft) && (
                              <span>
                                {number(props.floors.at(-1)!.penthouseSqft!)} sq
                                ft
                              </span>
                            )}
                          </div>
                        )}
                        {visibleList.map((category) => (
                          <div className="boq-premium-work" key={category.key}>
                            {renderCategoryTile(stage, category)}
                            {editing?.stage === stage &&
                            editing.category === category.key ? (
                              renderEditPanel(stage, category)
                            ) : (
                              <div className="boq-premium-table-wrap">
                                {entriesFor(stage, category.key).some(
                                  ({ output }) => output.quantity > 0,
                                ) ? (
                                  <table
                                    className="boq-premium-work-table"
                                    aria-label={
                                      category.label + ' measurements'
                                    }
                                  >
                                    <thead>
                                      <tr>
                                        <th>Item Description</th>
                                        <th>Quantity</th>
                                        <th>Unit</th>
                                        {props.canViewCost && (
                                          <>
                                            <th>Rate (₹)</th>
                                            <th>Amount (₹)</th>
                                          </>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entriesFor(stage, category.key)
                                        .filter(
                                          ({ output }) => output.quantity > 0,
                                        )
                                        .slice(0, 4)
                                        .map(
                                          ({ line, output, outputIndex }) => (
                                            <tr
                                              key={line.id + ':' + outputIndex}
                                            >
                                              <td>
                                                {output.name}
                                                {line.kind ===
                                                  'measured-geometry' && (
                                                  <small className="boq-premium-dimensions">
                                                    {number(
                                                      Number(
                                                        line.inputs.count ?? 1,
                                                      ),
                                                    )}{' '}
                                                    ×{' '}
                                                    {number(
                                                      Number(
                                                        line.inputs
                                                          .lengthFeet ?? 0,
                                                      ),
                                                    )}{' '}
                                                    ×{' '}
                                                    {number(
                                                      Number(
                                                        line.inputs.widthFeet ??
                                                          0,
                                                      ),
                                                    )}{' '}
                                                    ×{' '}
                                                    {number(
                                                      Number(
                                                        line.inputs.depthFeet ??
                                                          0,
                                                      ),
                                                    )}{' '}
                                                    ft
                                                  </small>
                                                )}
                                              </td>
                                              <td>{number(output.quantity)}</td>
                                              <td>{output.unit}</td>
                                              {props.canViewCost && (
                                                <>
                                                  <td>
                                                    {money(
                                                      props.rateFor(output),
                                                    )}
                                                  </td>
                                                  <td>
                                                    {money(priced(output))}
                                                  </td>
                                                </>
                                              )}
                                            </tr>
                                          ),
                                        )}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div className="boq-premium-empty">
                                    No measured items
                                  </div>
                                )}
                                {entriesFor(stage, category.key).filter(
                                  ({ output }) => output.quantity > 0,
                                ).length > 4 && (
                                  <button
                                    type="button"
                                    className="boq-premium-more"
                                    onClick={() =>
                                      openEditor(stage, category.key)
                                    }
                                  >
                                    View all{' '}
                                    {
                                      entriesFor(stage, category.key).filter(
                                        ({ output }) => output.quantity > 0,
                                      ).length
                                    }{' '}
                                    items
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="boq-stage-miscellaneous">
                          {preview ? (
                            miscellaneousRows.length > 0 && (
                              <div className="boq-stage-misc-preview">
                                <strong>Miscellaneous</strong>
                                {miscellaneousRows.map(({ line }) => (
                                  <div key={line.id}>
                                    <span>{line.name}</span>
                                    <span>
                                      {number(line.outputs[0]?.quantity ?? 0)}{' '}
                                      {line.outputs[0]?.unit || line.unit || ''}
                                    </span>
                                    {props.canViewCost && (
                                      <strong>
                                        {money(
                                          line.outputs.reduce(
                                            (sum, output) =>
                                              sum + priced(output),
                                            0,
                                          ),
                                        )}
                                      </strong>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <>
                              <button
                                className="boq-stage-misc-trigger"
                                type="button"
                                aria-expanded={miscellaneousStage === stage}
                                aria-controls={
                                  'boq-misc-' +
                                  stage.replace(/[^a-z0-9]/gi, '-')
                                }
                                onClick={() => toggleMiscellaneous(stage)}
                              >
                                <span className="boq-stage-misc-plus">＋</span>
                                <span className="boq-stage-misc-copy">
                                  <strong>Miscellaneous</strong>
                                  <small>Optional items</small>
                                </span>
                                {miscellaneousRows.length > 0 && (
                                  <span className="boq-stage-misc-count">
                                    {miscellaneousRows.length}{' '}
                                    {miscellaneousRows.length === 1
                                      ? 'item'
                                      : 'items'}
                                    {props.canViewCost
                                      ? ' · ' + money(miscellaneousTotal)
                                      : ''}
                                  </span>
                                )}
                                <span className="boq-stage-misc-chevron">
                                  {miscellaneousStage === stage ? '⌃' : '⌄'}
                                </span>
                              </button>
                              {miscellaneousStage === stage && (
                                <div
                                  className="boq-stage-misc-panel"
                                  id={
                                    'boq-misc-' +
                                    stage.replace(/[^a-z0-9]/gi, '-')
                                  }
                                >
                                  <div className="boq-stage-misc-heading">
                                    <h4>Miscellaneous — {stage}</h4>
                                  </div>
                                  {miscellaneousRows.map(
                                    ({ line, lineIndex }) => {
                                      const output = line.outputs[0];
                                      const details = {
                                        name: line.name,
                                        quantity: output?.quantity ?? 0,
                                        unit:
                                          output?.unit || line.unit || 'nos',
                                        rate:
                                          output?.rate ??
                                          (output ? props.rateFor(output) : 0),
                                      };
                                      return (
                                        <div
                                          className="boq-stage-misc-item"
                                          key={line.id}
                                        >
                                          <div className="boq-stage-misc-item-head">
                                            <strong>{line.name}</strong>
                                            <button
                                              type="button"
                                              className="boq-stage-misc-remove"
                                              onClick={() =>
                                                props.onRemoveManual(lineIndex)
                                              }
                                            >
                                              Remove
                                            </button>
                                          </div>
                                          <div className="boq-stage-input-grid">
                                            <InputText
                                              label="Item name"
                                              value={details.name}
                                              onChange={(name) =>
                                                props.onUpdateMiscellaneous(
                                                  lineIndex,
                                                  {
                                                    ...details,
                                                    name,
                                                  },
                                                )
                                              }
                                            />
                                            <InputNumber
                                              label="Quantity"
                                              value={details.quantity}
                                              onChange={(quantity) =>
                                                props.onUpdateMiscellaneous(
                                                  lineIndex,
                                                  {
                                                    ...details,
                                                    quantity,
                                                  },
                                                )
                                              }
                                            />
                                            <label className="boq-stage-field">
                                              <span>Unit</span>
                                              <select
                                                value={details.unit}
                                                onChange={(event) =>
                                                  props.onUpdateMiscellaneous(
                                                    lineIndex,
                                                    {
                                                      ...details,
                                                      unit: event.target.value,
                                                    },
                                                  )
                                                }
                                              >
                                                {[
                                                  details.unit,
                                                  'sqft',
                                                  'cft',
                                                  'm³',
                                                  'rft',
                                                  'nos',
                                                  'bag',
                                                  'kg',
                                                  't',
                                                  'lot',
                                                  'day',
                                                ]
                                                  .filter(
                                                    (value, index, values) =>
                                                      values.indexOf(value) ===
                                                      index,
                                                  )
                                                  .map((value) => (
                                                    <option
                                                      key={value}
                                                      value={value}
                                                    >
                                                      {value}
                                                    </option>
                                                  ))}
                                              </select>
                                            </label>
                                            {props.canViewCost && (
                                              <InputNumber
                                                label="Unit rate (₹)"
                                                value={details.rate}
                                                onChange={(rate) =>
                                                  props.onUpdateMiscellaneous(
                                                    lineIndex,
                                                    {
                                                      ...details,
                                                      rate,
                                                    },
                                                  )
                                                }
                                              />
                                            )}
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                  <div className="boq-stage-misc-add">
                                    <h4>Add miscellaneous item</h4>
                                    <div className="boq-stage-input-grid">
                                      <InputText
                                        label="Item name"
                                        value={manualName}
                                        placeholder="e.g. Extra material, transport or labour"
                                        onChange={setManualName}
                                      />
                                      <InputNumber
                                        label="Quantity"
                                        value={manualQuantity}
                                        onChange={setManualQuantity}
                                      />
                                      <label className="boq-stage-field">
                                        <span>Unit</span>
                                        <select
                                          value={manualUnit}
                                          onChange={(event) =>
                                            setManualUnit(event.target.value)
                                          }
                                        >
                                          {[
                                            'sqft',
                                            'cft',
                                            'm³',
                                            'rft',
                                            'nos',
                                            'bag',
                                            'kg',
                                            't',
                                            'lot',
                                            'day',
                                          ].map((unit) => (
                                            <option key={unit} value={unit}>
                                              {unit}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      {props.canViewCost && (
                                        <InputNumber
                                          label="Unit rate (₹)"
                                          value={manualRate}
                                          onChange={setManualRate}
                                        />
                                      )}
                                    </div>
                                    <button
                                      className="boq-stage-outline"
                                      type="button"
                                      disabled={
                                        !manualName.trim() ||
                                        !(manualQuantity > 0)
                                      }
                                      onClick={() => {
                                        props.onAddManual(
                                          stage,
                                          'miscellaneous',
                                          manualQuantity,
                                          manualUnit,
                                          props.canViewCost ? manualRate : 0,
                                          manualName.trim(),
                                        );
                                        setManualName('');
                                        setManualQuantity(0);
                                        setManualRate(0);
                                      }}
                                    >
                                      ＋ Add miscellaneous item
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  </Fragment>
                );
              })}
          {props.message && (
            <p className="boq-notice" role="status">
              {props.message}
            </p>
          )}
          <div
            className="boq-guided-footer"
            role="navigation"
            aria-label="BOQ wizard navigation"
          >
            <button
              type="button"
              className="boq-guided-back"
              onClick={() => goToWizard(previousBoqStep(guidedStep))}
              disabled={guidedStep === BOQ_WIZARD_STEPS[0]?.number}
            >
              ← Back
            </button>
            <button
              type="button"
              className="boq-guided-primary"
              disabled={
                props.busy ||
                props.calculating ||
                props.autoSaveLabel === 'Automatic save failed'
              }
              onClick={() => {
                if (!props.autoSaveLabel && props.canSave) props.onSave();
                if (!pendingCount)
                  setReviewedSteps((old) =>
                    old.includes(guidedStep) ? old : [...old, guidedStep],
                  );
                goToWizard(nextBoqStep(guidedStep));
              }}
            >
              {guidedStep === 13
                ? 'Final Detailed BOQ'
                : guidedStep === 14
                  ? 'Open Final BOQ'
                  : 'Save & Next'}{' '}
              →
            </button>
          </div>
        </div>
        {renderPreview()}
      </div>
    </section>
  );
}
