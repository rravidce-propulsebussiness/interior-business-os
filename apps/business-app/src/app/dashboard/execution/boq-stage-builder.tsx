'use client';

import { Fragment, useState } from 'react';
import type {
  BoqCounts,
  BoqFloor,
  DesignBeamType,
  DesignColumnType,
  DesignSettingKey,
  StructuralDesign,
} from '@business-os/core/construction-boq';

export type StageBoqOutput = {
  name: string;
  quantity: number;
  unit: string;
  material?: string;
  rate?: number;
  weightKg?: number;
  source?: string;
};
export type StageBoqLine = {
  id: string;
  name: string;
  section: string;
  kind: string;
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
  onFloorChange: (floors: BoqFloor[]) => void;
  repeatFrom: Record<string, string>;
  onRepeatFloors: (floors: string[], repeat: boolean) => void;
  onCustomizeFloor: (floor: string) => void;
  onUpdateQuantity: (
    lineIndex: number,
    outputIndex: number,
    quantity: number,
  ) => void;
  onUpdateRate: (lineIndex: number, outputIndex: number, rate: number) => void;
  rateFor: (output: StageBoqOutput) => number;
  onAddManual: (
    stage: string,
    category: string,
    quantity: number,
    unit: string,
    rate: number,
  ) => void;
  onRemoveManual: (lineIndex: number) => void;
  onSave: () => void;
  onPrint: () => void;
  onAdvanced: () => void;
  canViewCost: boolean;
  busy: boolean;
  message?: string;
  newDocument: boolean;
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
  const specified = manualCategory(line);
  if (specified) return specified;
  if (kind === 'quote-foundation') {
    if (/excavat|earthwork/i.test(output.name)) return 'excavation';
    if (/pcc|cement|sand|aggregate/i.test(output.name)) return 'pcc';
    return 'footings';
  }
  if (kind === 'quote-columns') return 'columns';
  if (kind === 'quote-pedestals') return 'footings';
  if (kind === 'quote-plinth-beam') return 'plinth';
  if (kind === 'quote-slab') return 'slab';
  if (kind === 'quote-staircase') return 'staircase';
  if (kind === 'quote-masonry') return 'brickwork';
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
    ...new Set(['Foundation', props.floors[0]?.name ?? '', props.floors.at(-1)?.name ?? '']),
  ]);
  const [activeTab, setActiveTab] = useState('Foundation');
  const [editing, setEditing] = useState<{
    stage: string;
    category: string;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  const [manualQuantity, setManualQuantity] = useState(0);
  const [manualRate, setManualRate] = useState(0);
  const [manualUnit, setManualUnit] = useState('sqft');
  const last = props.floors[props.floors.length - 1]?.name ?? '';
  const sections = ['Foundation', ...props.floors.map((f) => f.name)];
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
    if (
      key === 'columns' ||
      (stage === 'Foundation' &&
        ['footings', 'excavation', 'pcc', 'plinth'].includes(key))
    )
      return !isMeasuredColumn(props.design);
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
      const supported = stage === 'Foundation'
        ? foundation
        : stage === props.floors.at(-1)?.name ? terrace : standard;
      const bucket = supported.some((item) => item.key === matchedCategory)
        ? matchedCategory : 'extra';
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
    ) + visibleCost(stage, 'extra');
  const projectCost = sections.reduce(
    (sum, stage) =>
      sum +
      costForStage(
        stage,
        stage === 'Foundation'
          ? foundation
          : stage === last
            ? terrace
            : standard,
      ),
    0,
  );
  const toggleSection = (section: string) =>
    setExpanded((prior) =>
      prior.includes(section)
        ? prior.filter((id) => id !== section)
        : [...prior, section],
    );
  const openEditor = (stage: string, category: string) => {
    if (preview) return;
    if (props.repeatFrom[stage]) props.onCustomizeFloor(stage);
    setEditing((prior) =>
      prior?.stage === stage && prior.category === category
        ? null
        : { stage, category },
    );
  };
  const drawing = props.design ?? blankDesign();
  const setColumns = (columns: DesignColumnType[]) =>
    props.onDesignChange({ ...drawing, columns });
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
  const repeatedCount = props.floors
    .slice(1)
    .filter((f) => Boolean(props.repeatFrom[f.name])).length;
  const repeatAll =
    props.floors.length > 1 && repeatedCount === props.floors.length - 1;

  const renderEditPanel = (stage: string, category: Category) => {
    if (
      editing?.stage !== stage ||
      editing.category !== category.key ||
      preview
    )
      return null;
    const foundEntries = entriesFor(stage, category.key);
    const index = props.floors.findIndex((f) => f.name === stage);
    const floor = props.floors[index];
    const current = floor ? props.counts.floors[floor.name] : null;
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
    const isColumns = category.key === 'columns' || category.key === 'footings';
    const isBeams = category.key === 'beams';
    const designCategory = [
      'columns',
      'footings',
      'beams',
      'plinth',
      'slab',
      'staircase',
      'parapet',
      'waterproofing',
    ].includes(category.key);

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
            onClick={() => setEditing(null)}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
        {isColumns && (
          <>
            <p className="boq-stage-hint">
              Enter each column type from the structural drawing, including
              footing sizes and reinforcement. Zero or incomplete rows are not
              treated as measured.
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
                  {category.key === 'footings' && (
                    <>
                      <InputNumber
                        label="Footing length"
                        unit="ft"
                        value={col.footingLengthFeet}
                        onChange={(value) =>
                          updateCol(ci, { footingLengthFeet: value })
                        }
                      />
                      <InputNumber
                        label="Footing width"
                        unit="ft"
                        value={col.footingWidthFeet}
                        onChange={(value) =>
                          updateCol(ci, { footingWidthFeet: value })
                        }
                      />
                      <InputNumber
                        label="Footing thickness"
                        unit="in"
                        value={col.footingThicknessIn}
                        onChange={(value) =>
                          updateCol(ci, { footingThicknessIn: value })
                        }
                      />
                      <InputNumber
                        label="Mesh bar"
                        unit="mm"
                        value={col.footingBarDia}
                        onChange={(value) =>
                          updateCol(ci, { footingBarDia: value })
                        }
                      />
                      <InputNumber
                        label="Mesh spacing"
                        unit="in"
                        value={col.footingBarSpacingIn}
                        onChange={(value) =>
                          updateCol(ci, { footingBarSpacingIn: value })
                        }
                      />
                    </>
                  )}
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
              + Add column / footing type
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
              This floor's measured quantities are based on its area, room sizes
              and quotation specifications. You can override individual
              quantities and costs below, or open Detailed takeoff for
              room-by-room dimensions.
            </p>
          )}
        {foundEntries.length > 0 && !isColumns && !isBeams && (
          <>
            <h4>Calculated materials & labour</h4>
            <div className="boq-stage-output-rows">
              {foundEntries.map((entry) => (
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
                  {props.canViewCost && (
                    <InputNumber
                      label="Rate"
                      value={entry.output.rate ?? props.rateFor(entry.output)}
                      onChange={(value) =>
                        props.onUpdateRate(
                          entry.lineIndex,
                          entry.outputIndex,
                          value,
                        )
                      }
                    />
                  )}
                  {!entry.line.origin && (
                    <button
                      type="button"
                      onClick={() => props.onRemoveManual(entry.lineIndex)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {(!designCategory ||
          ['parapet', 'waterproofing'].includes(category.key)) && (
          <>
            <div className="boq-stage-manual">
              <h4>Add a measured item</h4>
              <div className="boq-stage-input-grid">
                <InputNumber
                  label="Quantity"
                  value={manualQuantity}
                  onChange={setManualQuantity}
                />
                <label className="boq-stage-field">
                  <span>Unit</span>
                  <select
                    value={manualUnit}
                    onChange={(event) => setManualUnit(event.target.value)}
                  >
                    <option value="sqft">sqft</option>
                    <option value="rft">rft</option>
                    <option value="m³">m³</option>
                    <option value="bag">bag</option>
                    <option value="kg">kg</option>
                    <option value="nos">nos</option>
                    <option value="lot">lot</option>
                  </select>
                </label>
                {props.canViewCost && (
                  <InputNumber
                    label="Unit rate"
                    value={manualRate}
                    onChange={setManualRate}
                  />
                )}
              </div>
              <button
                type="button"
                className="boq-stage-outline"
                disabled={manualQuantity <= 0}
                onClick={() => {
                  props.onAddManual(
                    stage,
                    category.key,
                    manualQuantity,
                    manualUnit,
                    props.canViewCost ? manualRate : 0,
                  );
                  setManualQuantity(0);
                  setManualRate(0);
                }}
              >
                + Add to {category.label}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section className="boq-stages" aria-label="Stage-wise BOQ builder">
      <div className="boq-stage-heading">
        <div className="boq-stage-heading-title">
          <span className="boq-stage-main-icon">▤</span>
          <div>
            <h2>BOQ Builder</h2>
            <p>Stage-wise quantity and cost setup</p>
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
      <div
        className="boq-stage-tabs"
        role="group"
        aria-label="Jump to BOQ stage"
      >
        {sections.map((stage) => (
          <button
            key={stage}
            type="button"
            className={activeTab === stage ? 'selected' : ''}
            onClick={() => {
              setActiveTab(stage);
              if (!expanded.includes(stage)) toggleSection(stage);
              document
                .getElementById('boq-stage-' + sections.indexOf(stage))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {stage}
          </button>
        ))}
      </div>
      {sections.map((stage, stageIndex) => {
        const isFoundation = stage === 'Foundation';
        const isTop = stage === last && !isFoundation;
        const list = isFoundation ? foundation : isTop ? terrace : standard;
        const visibleList = isFoundation
          ? list
          : [...list, { key: 'extra', label: 'Add Item', icon: '＋' }];
        const open = expanded.includes(stage);
        const inherited = Boolean(props.repeatFrom[stage]);
        const total = costForStage(stage, list);
        return (
          <Fragment key={stage}>
            {!isFoundation && stageIndex === 2 && props.floors.length > 1 && (
              <div className="boq-stage-repeat">
                <div className="boq-stage-repeat-title">
                  <span>▱</span>
                  <div>
                    <strong>Repeat to floors</strong>
                    <small>Reuse the same BOQ setup for other floors</small>
                  </div>
                </div>
                <div className="boq-stage-repeat-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={repeatAll}
                      onChange={(event) =>
                        props.onRepeatFloors(
                          props.floors.slice(1).map((floor) => floor.name),
                          event.target.checked,
                        )
                      }
                    />
                    Repeat same stage setup for other floors
                  </label>
                  <small>
                    Customize any floor to keep its own measurements.
                  </small>
                </div>
              </div>
            )}
            <article className="boq-stage-card" id={'boq-stage-' + stageIndex}>
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
                  <span className="boq-stage-chevron">{open ? '⌃' : '⌄'}</span>
                </button>
              </div>
              {inherited && (
                <div className="boq-stage-customize">
                  <span>
                    Repeated quantities follow {props.repeatFrom[stage]} until
                    customized.
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
                      (category.key === 'beams' &&
                        entriesFor(stage, 'slab').some(
                          (entry) => entry.line.kind === 'quote-slab',
                        )) ||
                      (category.key === 'plaster' &&
                        entriesFor(stage, 'brickwork').some(
                          (entry) => entry.line.kind === 'quote-masonry',
                        ));
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
                            <small className="pending">Not entered yet</small>
                          ) : !entries.length && combined ? (
                            <small>
                              Included with{' '}
                              {category.key === 'beams' ? 'slab' : 'brickwork'}
                            </small>
                          ) : !entries.length ? (
                            <small>Not measured</small>
                          ) : (
                            <small>
                              {qty || 'Measured'}
                              {props.canViewCost ? ' · ' + money(amount) : ''}
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
                      Other measured work: {money(visibleCost(stage, 'extra'))}
                    </div>
                  )}
                  {editing?.stage === stage &&
                    renderEditPanel(
                      stage,
                      (visibleList.find(
                        (item) => item.key === editing.category,
                      ) ?? visibleList[0])!,
                    )}
                </div>
              )}
            </article>
          </Fragment>
        );
      })}
      <div className="boq-stage-total">
        <div>
          <small>
            Project BOQ {props.newDocument ? '(Estimated)' : '(Saved)'}
          </small>
          <strong>
            {props.canViewCost ? money(projectCost) : 'Restricted'}
          </strong>
        </div>
        <div className="boq-stage-total-breakdown">
          {sections.map((stage) => (
            <span key={stage}>
              {stage}
              <b>
                {props.canViewCost
                  ? money(
                      costForStage(
                        stage,
                        stage === 'Foundation'
                          ? foundation
                          : stage === last
                            ? terrace
                            : standard,
                      ),
                    )
                  : '—'}
              </b>
            </span>
          ))}
        </div>
      </div>
      {props.message && (
        <p className="boq-notice" role="status">
          {props.message}
        </p>
      )}
      <div className="boq-stage-actions">
        <button
          type="button"
          className="boq-stage-outline"
          onClick={() => {
            if (!preview) setExpanded(sections);
            setPreview(!preview);
            setEditing(null);
          }}
        >
          ◉ {preview ? 'Back to Builder' : 'Preview BOQ'}
        </button>
        <button
          type="button"
          className="boq-stage-save"
          disabled={props.busy}
          onClick={props.onSave}
        >
          ▣ {props.busy ? 'Saving…' : 'Save BOQ'}
        </button>
        <button
          type="button"
          className="boq-stage-outline"
          onClick={() => {
            setExpanded(sections);
            window.setTimeout(props.onPrint, 30);
          }}
        >
          ▤ Print / PDF
        </button>
      </div>
      <button
        type="button"
        className="boq-stage-advanced"
        onClick={props.onAdvanced}
      >
        Detailed takeoff, materials, rates & room measurements
      </button>
    </section>
  );
}
