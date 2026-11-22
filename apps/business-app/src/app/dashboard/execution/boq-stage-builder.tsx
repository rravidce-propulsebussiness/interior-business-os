'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Rate } from './boq-pricing';
import {
  BoqFloorProjectSetup,
  BoqWizardProgress,
  wizardStep,
} from './boq-wizard-flow';
import type {
  BoqCounts,
  BoqFloor,
  DesignBeamType,
  DesignColumnType,
  DesignSettingKey,
  StructuralDesign,
  StructuralSettings,
  WallMeasure,
} from '@business-os/core/construction-boq';
import {
  measuredVolume,
  FEET_PER_METRE,
  type MeasuredDimensions,
  type MeasuredKind,
} from './boq-stage-measurements';
import { BoqFootingEditor } from './boq-footing-editor';
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
  onOpenLabour?: () => void;
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
    return /^(?:Internal|External) plaster$|\(plaster\)/i.test(output.name)
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

function InputNumber({
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
      <input
        type="number"
        min={min}
        step="any"
        value={value}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || 0))
        }
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
  const [expanded, setExpanded] = useState<string[]>([
    ...new Set([
      'Foundation',
      props.floors[0]?.name ?? '',
      props.floors.at(-1)?.name ?? '',
    ]),
  ]);
  const [activeTab, setActiveTab] = useState('Foundation');
  const [guidedStep, setGuidedStep] = useState(props.initialStep ?? 2);
  const [focused, setFocused] = useState<{
    stage: string;
    category: string;
  } | null>(null);
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
        setFocused({ stage, category });
        setEditing({ stage, category });
        setActiveTab(stage);
      } else {
        setFocused(null);
        setEditing(null);
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const sections = ['Foundation', ...props.floors.map((f) => f.name)];
  const selectedWizard = wizardStep(guidedStep);
  const measurementScreen = guidedStep >= 4 && guidedStep <= 11;
  // No second structural schedule: these screens only filter existing editors.
  const guidedSections =
    selectedWizard.scope === 'foundation' && guidedStep <= 5
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
    setFocused(null);
    setMiscellaneousStage(null);
    syncFocusUrl(null);
    const stage =
      step <= 6
        ? 'Foundation'
        : props.floors.some((floor) => floor.name === activeTab)
          ? activeTab
          : (props.floors[0]?.name ?? 'Foundation');
    setActiveTab(stage);
    setExpanded((prior) => [...new Set([...prior, stage])]);
    if (step === 13) props.onOpenLabour?.();
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
      return !(props.design?.plinthRunFeet && props.design.plinthRunFeet > 0);
    if (key === 'beams')
      return !isMeasuredBeam(
        props.design,
        Math.max(
          0,
          props.floors.findIndex((floor) => floor.name === stage),
        ),
      );
    if (key === 'slab')
      return !Boolean(
        props.design?.settings?.slabMainDia &&
        props.design?.settings?.slabDistDia &&
        props.design?.settings?.slabThicknessIn,
      );
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
    unmeasured(stage, category)
      ? 0
      : entriesFor(stage, category).reduce(
          (sum, entry) => sum + priced(entry.output),
          0,
        );
  const costForStage = (stage: string, categories: Category[]) =>
    categories.reduce(
      (sum, category) => sum + visibleCost(stage, category.key),
      0,
    ) +
    visibleCost(stage, 'extra') +
    visibleCost(stage, 'miscellaneous') +
    (props.labourStageCosts?.[stage] ?? 0);
  const toggleSection = (section: string) =>
    setExpanded((prior) =>
      prior.includes(section)
        ? prior.filter((id) => id !== section)
        : [...prior, section],
    );
  const openEditor = (stage: string, category: string) => {
    if (preview) return;
    setFocused({ stage, category });
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
  const setSetting = (key: DesignSettingKey, value: number) =>
    props.onDesignChange({
      ...drawing,
      settings: { ...drawing.settings, [key]: value },
    });
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
    const volume = measuredVolume(dimensionDraft);
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
        platformFeet:
          finishes?.kitchenPlatformFeet ||
          finishDefaults.kitchenPlatformFeet ||
          10,
        platformDepthFeet: finishDefaults.kitchenPlatformDepthFeet || 2,
        wallTileFeet:
          finishes?.kitchenPlatformFeet ||
          finishDefaults.kitchenPlatformFeet ||
          10,
        wallTileHeightFeet: finishDefaults.kitchenWallTileHeightFeet || 2,
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
    const isColumns = category.key === 'columns';
    const isFootings = category.key === 'footings';
    const isBeams = category.key === 'beams';
    return (
      <div className="boq-stage-edit" key={stage + ':' + category.key}>
        <div className="boq-stage-edit-head">
          <div>
            <strong>Edit {category.label}</strong>
            <small>{stage} · changes update the BOQ quantities</small>
          </div>
          <button
            type="button"
            className="boq-stage-close"
            onClick={() => {
              setEditing(null);
              setFocused(null);
              syncFocusUrl(null);
            }}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
        {isGeometry(category.key) && (
          <div className="boq-stage-dimensions">
            <p className="boq-stage-hint">
              Enter the measured count, length, width and depth. Volume is
              calculated in cubic feet and cubic metres; material rates use m³.
              No value is assumed from the overall floor area.
            </p>
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
              };
              const measured = measuredVolume(dims);
              const changeDimension = (
                field: keyof MeasuredDimensions,
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
                    {(['lengthFeet', 'widthFeet', 'depthFeet'] as const).map(
                      (field) => (
                        <InputNumber
                          key={field}
                          label={
                            {
                              lengthFeet: 'Length',
                              widthFeet: 'Width',
                              depthFeet: 'Depth / thickness',
                            }[field]
                          }
                          unit={dimensionUnit}
                          value={Number(
                            (dims[field] * displayFactor).toFixed(3),
                          )}
                          onChange={(v) => changeDimension(field, v)}
                        />
                      ),
                    )}
                  </div>
                  <div className="boq-stage-volume">
                    <span>{number(measured.cft)} cft</span>
                    <strong>{number(measured.m3)} m³</strong>
                  </div>
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
                {(['lengthFeet', 'widthFeet', 'depthFeet'] as const).map(
                  (field) => (
                    <InputNumber
                      key={field}
                      label={
                        {
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
                  ),
                )}
              </div>
              <div className="boq-stage-volume">
                <span>{number(volume.cft)} cft</span>
                <strong>{number(volume.m3)} m³</strong>
              </div>
              {category.key === 'pcc' && (
                <small className="boq-stage-hint">
                  PCC cement, sand and aggregate are calculated using the
                  editable mix quantities in BOQ Rates. Concrete volume is
                  informational and is not also charged as ready-mix.
                </small>
              )}
              {['sajjas', 'shelves'].includes(category.key) && (
                <small className="boq-stage-hint">
                  This measures concrete and estimates shuttering. Enter
                  reinforcement separately from the structural drawing; no steel
                  is invented.
                </small>
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
                    dimensionDraft,
                  );
                  setDimensionDraft({
                    count: 1,
                    lengthFeet: 0,
                    widthFeet: 0,
                    depthFeet: 0,
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
            <p className="boq-stage-hint">
              Measure each wall type from the drawing. Enter external 9 inch and
              internal 4/4.5 inch walls separately, including same-wall count.
              Door and window areas from the Doors & Windows card are deducted
              once, instead of using an estimated opening percentage. Brick,
              cement and sand quantities follow the editable 100 sqft rules in
              BOQ Rates.
            </p>
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
            <p className="boq-stage-hint">
              Copies external walls only where that floor has no external
              measurements. Penthouse and previously measured floors remain
              unchanged.
            </p>
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
            {walls.length > 0 && (
              <p className="boq-stage-hint">
                Wall deduction and quantities recalculate when opening sizes
                change. For incomplete opening schedules, typical sizes are
                assumed and flagged in the drawing warnings.
              </p>
            )}
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
            <p className="boq-stage-hint">
              Enter C1, C2 and other column types separately from F1/F2
              footings. Main bars and rings are calculated here; footing
              reinforcement and pedestals belong only in the Footings editor.
            </p>
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
                  <InputText
                    label="Main bars (e.g. 4-16+2-12)"
                    value={col.bars}
                    placeholder="4-16+2-12"
                    onChange={(value) => updateCol(ci, { bars: value })}
                  />
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
            <p className="boq-stage-hint">
              Record each beam type and its running length under this floor’s
              roof. The engine calculates concrete and stirrups together with
              the slab; costs are not counted twice.
            </p>
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
                  <InputText
                    label="Main bars (e.g. 2-16+2-12)"
                    value={beam.bars}
                    onChange={(value) => updateBeam(bi, { bars: value })}
                  />
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
                    label="Run under this roof"
                    unit="ft"
                    value={beam.runFeet[index] ?? 0}
                    onChange={(value) =>
                      updateBeam(bi, {
                        runFeet: props.floors.map((_, i) =>
                          i === index ? value : (beam.runFeet[i] ?? 0),
                        ),
                      })
                    }
                  />
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
          <div className="boq-stage-input-grid">
            <InputNumber
              label="Plinth beam total running length"
              unit="ft"
              value={drawing.plinthRunFeet}
              onChange={(value) =>
                props.onDesignChange({ ...drawing, plinthRunFeet: value })
              }
            />
            {fieldFor('plinthBeamWidthIn', 'Plinth width', 9)}
            {fieldFor('plinthBeamDepthIn', 'Plinth depth', 12)}
            {fieldFor('plinthBeamBarCount', 'Main bars', 6, 'nos')}
            {fieldFor('plinthBeamBarDia', 'Main bar diameter', 12, 'mm')}
            {fieldFor('plinthBeamStirrupDia', 'Stirrup diameter', 8, 'mm')}
            {fieldFor('plinthBeamStirrupSpacingIn', 'Stirrup spacing', 6)}
          </div>
        )}
        {category.key === 'slab' && (
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
                          ? { ...f, heightFeet: value, heightAssumed: false }
                          : f,
                      ),
                    )
                  }
                />
              </>
            )}
            {fieldFor('slabThicknessIn', 'Slab thickness', 5)}
            {fieldFor('slabMainDia', 'Main bar diameter', 10, 'mm')}
            {fieldFor('slabMainSpacingIn', 'Main bar spacing', 6)}
            {fieldFor('slabDistDia', 'Distribution bar', 8, 'mm')}
            {fieldFor('slabDistSpacingIn', 'Distribution spacing', 8)}
          </div>
        )}
        {category.key === 'staircase' && (
          <div className="boq-stage-input-grid">
            {fieldFor('stairWidthFeet', 'Stair width', 3.5, 'ft')}
            {fieldFor('stairRiserIn', 'Riser', 6)}
            {fieldFor('stairTreadIn', 'Tread', 10)}
            {fieldFor('stairWaistIn', 'Waist slab', 6)}
            {fieldFor('stairMainDia', 'Main bar', 12, 'mm')}
            {fieldFor('stairBarSpacingIn', 'Bar spacing', 6)}
          </div>
        )}
        {category.key === 'parapet' && (
          <p className="boq-stage-hint">
            Parapet quantities use the terrace footprint and the company
            rate-card height. Adjust its measured quantity or rate below; the
            saved override remains in the BOQ.
          </p>
        )}
        {category.key === 'waterproofing' && (
          <p className="boq-stage-hint">
            Enter waterproofing square footage separately from parapet masonry,
            to avoid double charging.
          </p>
        )}
        {current &&
          (category.key === 'doors' ||
            category.key === 'electrical' ||
            category.key === 'plumbing') && (
            <div className="boq-stage-input-grid">
              {(category.key === 'doors'
                ? [
                    ['mainDoors', 'Main doors'],
                    ['internalDoors', 'Internal doors'],
                    ['bathroomDoors', 'Bathroom doors'],
                    ['poojaDoors', 'Pooja doors'],
                    ['windows', 'Windows'],
                    ['ventilators', 'Ventilators'],
                  ]
                : category.key === 'electrical'
                  ? [
                      ['lightPoints', 'Lights'],
                      ['fanPoints', 'Fans'],
                      ['socketPoints', '6A sockets'],
                      ['powerPoints', '16A power points'],
                    ]
                  : [
                      ['bathrooms', 'Bathrooms'],
                      ['kitchens', 'Kitchens'],
                    ]
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
            <h4>Flooring & kitchens on {stage}</h4>
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
            <p className="boq-stage-hint">
              Kitchen granite and wall tiles are measured separately for each
              kitchen. Removing a kitchen removes its quantities from this floor
              only.
            </p>
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
            {measuredKitchens.length === 0 && (
              <p className="boq-stage-hint">No kitchen on this floor.</p>
            )}
            <button
              type="button"
              className="boq-stage-outline"
              onClick={() =>
                updateKitchens([
                  ...measuredKitchens,
                  {
                    id: 'kitchen-' + Date.now().toString(36),
                    name: 'Kitchen ' + (measuredKitchens.length + 1),
                    platformFeet: finishDefaults.kitchenPlatformFeet || 10,
                    platformDepthFeet:
                      finishDefaults.kitchenPlatformDepthFeet || 2,
                    wallTileFeet: finishDefaults.kitchenPlatformFeet || 10,
                    wallTileHeightFeet:
                      finishDefaults.kitchenWallTileHeightFeet || 2,
                  },
                ])
              }
            >
              ＋ Add kitchen
            </button>
            <p className="boq-stage-hint">
              Room flooring can be set to zero above; bathroom tiles are
              controlled by the bathroom count, and each extra kitchen has
              independent dimensions.
            </p>
          </div>
        )}
        {floor && category.key === 'staircase' && (
          <div className="boq-stage-dimensions">
            <h4>Staircase finishes on {stage}</h4>
            <p className="boq-stage-hint">
              Granite and railing are independent measurements. Enter 0 if
              absent. Structural staircase concrete is estimated separately.
            </p>
            <div className="boq-stage-input-grid">
              <InputNumber
                label="Staircase granite"
                unit="sqft"
                value={
                  finishes?.staircaseGraniteSqft ??
                  (finishDefaults.stairsPerFloor || 1) *
                    (finishDefaults.stairWidthFeet || 3) *
                    (Math.ceil(
                      (floor.heightFeet * 12) /
                        (finishDefaults.stairRiserIn || 7),
                    ) *
                      (((finishDefaults.stairTreadIn || 10) +
                        (finishDefaults.stairRiserIn || 7)) /
                        12) +
                      (finishDefaults.stairLandingFeet || 0))
                }
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
                            platformFeet:
                              finishDefaults.kitchenPlatformFeet || 10,
                            platformDepthFeet:
                              finishDefaults.kitchenPlatformDepthFeet || 2,
                            wallTileFeet:
                              finishDefaults.kitchenPlatformFeet || 10,
                            wallTileHeightFeet:
                              finishDefaults.kitchenWallTileHeightFeet || 2,
                          },
                      ),
                    );
                  else changeCount('kitchens', value);
                }}
              />
            </div>
            <p className="boq-stage-hint">
              Set an unused service to 0; add separately measured plumbing work
              below if the quotation does not include it.
            </p>
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
        {current && category.key === 'doors' && (
          <div className="boq-stage-subcard">
            <h4>Door, window and ventilator sizes from drawing</h4>
            <p className="boq-stage-hint">
              Enter number × width × height in feet, for example 2×3×7. Window
              price is calculated per square foot; door package price limits
              remain per door. The measured opening areas are deducted from the
              correct external or internal brick wall group.
            </p>
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
            <p className="boq-stage-hint">
              If the drawing lists different sizes, enter each group separated
              by a comma. Counts and size schedules should agree. Any missing
              dimensions are labelled as assumed in the BOQ drawing warnings.
            </p>
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
        {current &&
          ['tiles', 'painting', 'plaster', 'brickwork'].includes(
            category.key,
          ) && (
            <p className="boq-stage-hint">
              This floor&apos;s measured quantities are based on its area, room
              sizes and quotation specifications. You can override individual
              quantities and costs below, or open Detailed takeoff for
              room-by-room dimensions.
            </p>
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
                      {entry.output.quotedRate !== undefined && (
                        <small className="boq-stage-limit">
                          Quotation package limit:
                          {money(entry.output.quotedRate)} / {entry.output.unit}
                        </small>
                      )}
                      {entry.line.origin &&
                      entry.output.material === 'concrete_m20' ? (
                        props.canViewCost && (
                          <small className="boq-stage-limit">
                            M20 RMC rate: {money(props.structuralRmcRate)} / m³
                            · Change it once in Structural Concrete Costing.
                          </small>
                        )
                      ) : props.isOldLabourOutput?.(entry.output) ? (
                        <small className="boq-stage-limit">
                          Labour priced in the Labour Costing tab; no duplicate
                          charge.
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

  if (focused) {
    const sectionCategories =
      focused.stage === 'Foundation'
        ? foundation
        : focused.stage === last
          ? terrace
          : standard;
    const activeWork = sectionCategories.find(
      (item) => item.key === focused.category,
    );
    return (
      <section className="boq-work-focus" aria-label="Focused BOQ work editor">
        <BoqWizardProgress active={guidedStep} onChange={goToWizard} />
        <button
          type="button"
          className="boq-focus-back"
          onClick={() => {
            setEditing(null);
            setFocused(null);
            setActiveTab(focused.stage);
            syncFocusUrl(null);
          }}
        >
          ← {focused.stage} work list
        </button>
        <header className="boq-focus-heading">
          <span>{activeWork?.icon || '▤'}</span>
          <div>
            <small>{focused.stage}</small>
            <h2>{activeWork?.label || focused.category}</h2>
          </div>
          {props.autoSaveLabel && (
            <small className="boq-autosave-status">{props.autoSaveLabel}</small>
          )}
        </header>
        {activeWork ? (
          renderEditPanel(focused.stage, activeWork)
        ) : (
          <p>Select a valid work category.</p>
        )}
      </section>
    );
  }

  return (
    <section className="boq-stages" aria-label="Stage-wise BOQ builder">
      <div className="boq-stage-heading">
        <div className="boq-stage-heading-title">
          <span className="boq-stage-main-icon">▤</span>
          <div>
            <h2>Detailed BOQ Builder</h2>
            <p>
              One drawing entry · Auto-calculated materials & labour · One final
              floor-wise report
            </p>
          </div>
        </div>
        <label className="boq-stage-project">
          <span>Project</span>
          <select
            value={props.projectId}
            onChange={(event) => props.onProjectChange(event.target.value)}
            disabled={!props.newDocument}
          >
            <option value="">Choose project</option>
            {props.projects.map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={!p.eligible && p.id !== props.projectId}
              >
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="boq-stage-document">
        <label>
          <span>BOQ name</span>
          <input
            value={props.title}
            maxLength={200}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </label>
        <p>
          {props.quoteLabel ||
            'Choose a project with a saved final quotation to begin.'}
        </p>
      </div>
      <BoqWizardProgress active={guidedStep} onChange={goToWizard} />
      <div className="boq-guided-screen-heading">
        <span>{String(guidedStep).padStart(2, '0')} / 14</span>
        <div>
          <h3>{selectedWizard.title}</h3>
          <p>{selectedWizard.description}</p>
        </div>
        {props.autoSaveLabel && (
          <small className="boq-autosave-status">{props.autoSaveLabel}</small>
        )}
      </div>
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
          autoSaveLabel={props.autoSaveLabel}
        />
      )}
      {guidedStep === 12 && (
        <section className="boq-guided-panel boq-guided-center">
          <div className="boq-guided-panel-head">
            <div>
              <h3>Material Rate Card</h3>
              <p>
                Enter cement, steel by diameter, RMC, aggregate, sand, bricks,
                tiles, granite and all other material rates once.
              </p>
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
                        <td>{rate.rate > 0 ? money(rate.rate) : 'Not set'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p>
            Rates are shared by the same BOQ quantity lines. Editing one rate
            recalculates cost; it does not create another measurement or
            estimate.
          </p>
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
      {guidedStep === 13 && (
        <section className="boq-guided-panel boq-guided-center">
          <div className="boq-guided-panel-head">
            <div>
              <h3>Labour Costing</h3>
              <p>
                Choose one base method: composite per sq ft, item-wise, or daily
                labour. Extra work is charged only when outside the covered
                package.
              </p>
            </div>
          </div>
          <button
            className="boq-guided-primary"
            type="button"
            onClick={() => props.onOpenLabour?.()}
          >
            Open Actual Labour Costing →
          </button>
        </section>
      )}
      {guidedStep === 14 && (
        <section className="boq-guided-panel boq-guided-center">
          <div className="boq-guided-panel-head">
            <div>
              <h3>One Final Detailed BOQ</h3>
              <p>
                See every item, quantity, rate and amount under its floor, with
                one material and labour total.
              </p>
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
      {measurementScreen && (
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
                if (!expanded.includes(stage)) toggleSection(stage);
                setExpanded((prior) =>
                  prior.includes(stage) ? prior : [...prior, stage],
                );
              }}
            >
              {stage}
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
            const list = isFoundation ? foundation : isTop ? terrace : standard;
            const visibleList = list.filter((item) =>
              selectedWizard.categories.includes(item.key),
            );
            const open = expanded.includes(stage);
            const inherited = Boolean(props.repeatFrom[stage]);
            const total = costForStage(stage, list);
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
                          <small>
                            Reuse the same BOQ setup for other floors
                          </small>
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
                          Repeat same stage setup for other floors
                        </label>
                        <small>
                          Full floors can repeat; penthouse areas are excluded
                          from bulk repetition.
                        </small>
                        <div className="boq-stage-repeat-targets">
                          {props.floors.slice(1).map((floor) => (
                            <label key={floor.name}>
                              <input
                                type="checkbox"
                                checked={Boolean(props.repeatFrom[floor.name])}
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
                  <div
                    className={
                      open ? 'boq-stage-card-head open' : 'boq-stage-card-head'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(stage)}
                      aria-expanded={open}
                    >
                      <span className="boq-stage-card-symbol">
                        {isFoundation ? '♜' : '▱'}
                      </span>
                      <strong>{isTop ? stage + ' / Terrace' : stage}</strong>
                      {inherited && (
                        <small className="boq-stage-inherited">
                          ↗ Repeated from {props.repeatFrom[stage]}
                        </small>
                      )}
                      {props.canViewCost && <b>{money(total)}</b>}
                      <span className="boq-stage-chevron">
                        {open ? '⌃' : '⌄'}
                      </span>
                    </button>
                  </div>
                  {inherited && (
                    <div className="boq-stage-customize">
                      <span>
                        Repeated quantities follow {props.repeatFrom[stage]}{' '}
                        until customized.
                      </span>
                      <button
                        type="button"
                        onClick={() => props.onCustomizeFloor(stage)}
                      >
                        ✎ Customize
                      </button>
                    </div>
                  )}
                  {open && (
                    <div
                      className={
                        isFoundation
                          ? 'boq-stage-items foundation'
                          : 'boq-stage-items'
                      }
                    >
                      {props.canViewCost &&
                        (props.labourStageCosts?.[stage] ?? 0) > 0 && (
                          <div className="boq-stage-extra-note">
                            Labour package allocation:{' '}
                            {money(props.labourStageCosts?.[stage] ?? 0)} ·
                            charged once in the BOQ total.
                          </div>
                        )}
                      {visibleList.map((category) => {
                        const entries = entriesFor(stage, category.key);
                        const pending = unmeasured(stage, category.key);
                        const amount = visibleCost(stage, category.key);
                        const unit =
                          entries.length === 1 ? entries[0]!.output.unit : '';
                        const qty =
                          entries.length === 1
                            ? number(entries[0]!.output.quantity) + ' ' + unit
                            : entries.length
                              ? entries.length + ' materials'
                              : '';
                        const combined =
                          category.key === 'beams' &&
                          entriesFor(stage, 'slab').some(
                            (entry) => entry.line.kind === 'quote-slab',
                          );
                        return (
                          <div className="boq-stage-tile" key={category.key}>
                            <span
                              className="boq-stage-tile-icon"
                              aria-hidden="true"
                            >
                              {category.icon}
                            </span>
                            <div className="boq-stage-tile-body">
                              <strong>{category.label}</strong>
                              {pending ? (
                                <small className="pending">
                                  Not entered yet
                                </small>
                              ) : !entries.length && combined ? (
                                <small>Included with slab</small>
                              ) : !entries.length ? (
                                <small>Not measured</small>
                              ) : (
                                <small>
                                  {qty || 'Measured'}
                                  {props.canViewCost
                                    ? ' · ' + money(amount)
                                    : ''}
                                </small>
                              )}
                            </div>
                            {!preview && (
                              <button
                                className="boq-stage-tile-edit"
                                type="button"
                                aria-label={
                                  'Edit ' + category.label + ' on ' + stage
                                }
                                onClick={() => openEditor(stage, category.key)}
                              >
                                ✎
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {entriesFor(stage, 'extra').length > 0 && (
                        <div className="boq-stage-extra-note">
                          Other measured work:{' '}
                          {money(visibleCost(stage, 'extra'))}
                        </div>
                      )}
                      {editing?.stage === stage &&
                        renderEditPanel(
                          stage,
                          (visibleList.find(
                            (item) => item.key === editing.category,
                          ) ?? visibleList[0])!,
                        )}
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
                                          (sum, output) => sum + priced(output),
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
                                'boq-misc-' + stage.replace(/[^a-z0-9]/gi, '-')
                              }
                              onClick={() => toggleMiscellaneous(stage)}
                            >
                              <span className="boq-stage-misc-plus">＋</span>
                              <span className="boq-stage-misc-copy">
                                <strong>Miscellaneous</strong>
                                <small>
                                  Extra materials, labour or work for {stage}
                                </small>
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
                                  <p>
                                    Add only work not included in the measured
                                    stages or quotation. Each item contributes
                                    to this stage&apos;s BOQ total.
                                  </p>
                                </div>
                                {miscellaneousRows.map(
                                  ({ line, lineIndex }) => {
                                    const output = line.outputs[0];
                                    const details = {
                                      name: line.name,
                                      quantity: output?.quantity ?? 0,
                                      unit: output?.unit || line.unit || 'nos',
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
                  )}
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
          onClick={() => goToWizard(Math.max(2, guidedStep - 1))}
          disabled={guidedStep === 2}
        >
          ← Back
        </button>
        <span>
          {props.autoSaveLabel ?? 'Measurements update the same BOQ document'}
        </span>
        <button
          type="button"
          className="boq-guided-primary"
          onClick={() => goToWizard(Math.min(14, guidedStep + 1))}
        >
          {guidedStep === 13
            ? 'Final Detailed BOQ'
            : guidedStep === 14
              ? 'Open Final BOQ'
              : 'Save & Continue'}{' '}
          →
        </button>
      </div>
      <div className="boq-stage-actions">
        <button
          type="button"
          className="boq-stage-outline"
          onClick={props.onDetailedBoq}
          disabled={!props.canOpenDetailed}
          title={
            props.canOpenDetailed
              ? 'Open the detailed, floor-wise priced BOQ'
              : 'Available when changes are saved automatically'
          }
        >
          ◉ Detailed BOQ
        </button>
        {props.autoSaveLabel ? (
          <span className="boq-autosave-status" role="status">
            {props.autoSaveLabel}
          </span>
        ) : (
          <button
            type="button"
            className="boq-stage-save"
            disabled={props.busy || !props.canSave}
            onClick={props.onSave}
          >
            ▣ {props.busy ? 'Saving…' : 'Save BOQ'}
          </button>
        )}
      </div>
    </section>
  );
}
