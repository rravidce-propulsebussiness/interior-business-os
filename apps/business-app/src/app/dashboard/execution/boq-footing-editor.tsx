'use client';

import {
  FOOTING_TYPES, newFootingType,
  type DesignFootingType,
} from '@business-os/core/construction-boq';

type Props = {
  footings: DesignFootingType[];
  columnLabels: string[];
  onChange: (footings: DesignFootingType[]) => void;
};
const labels: Record<DesignFootingType['type'], string> = {
  isolated: 'Isolated — single-column',
  combined: 'Combined — two or more columns',
  strap: 'Strap — two pads and connecting beam',
  raft: 'Raft / mat — common foundation slab',
  strip: 'Strip / continuous footing',
  pile_cap: 'Pile cap — cap only, excludes piles',
};
const number = (n: number) => Number.isFinite(n) ? n : 0;
function Numeric({ label, value, onChange, unit, min = 0 }: {
  label: string; value: number; onChange: (n: number) => void;
  unit?: string; min?: number;
}) {
  return <label className="boq-stage-field">
    <span>{label}{unit ? ` (${unit})` : ''}</span>
    <input type="number" inputMode="decimal" min={min} step="any" value={value}
      onChange={(e) => onChange(Math.max(min, number(Number(e.target.value))))} />
  </label>;
}
export function BoqFootingEditor({ footings, columnLabels, onChange }: Props) {
  const change = (index: number, patch: Partial<DesignFootingType>) =>
    onChange(footings.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="boq-footing-editor">
    <p className="boq-stage-hint">
      Footing IDs (F1, F2…) are independent of the column schedule (C1, C2…).
      Choose the foundation configuration and enter its dimensions and reinforcement
      from the approved structural drawing. Single/double mesh describes steel layers,
      not a raft foundation.
    </p>
    {footings.map((f, fi) => {
      const patch = (entry: Partial<DesignFootingType>) => change(fi, entry);
      const padUnits = f.type === 'strap' ? Math.max(2, f.padsPerGroup) : 1;
      return <div className="boq-stage-subcard boq-footing-type" key={fi}>
        <div className="boq-stage-subhead">
          <strong>{f.label || `Footing ${fi + 1}`}</strong>
          <button type="button" onClick={() => onChange(footings.filter((_, i) => i !== fi))}>
            Remove
          </button>
        </div>
        <div className="boq-stage-input-grid">
          <label className="boq-stage-field"><span>Footing reference</span>
            <input value={f.label} maxLength={40}
              onChange={(e) => patch({ label: e.target.value })}/>
          </label>
          <label className="boq-stage-field"><span>Foundation configuration</span>
            <select value={f.type} onChange={(e) => {
              const type = e.target.value as DesignFootingType['type'];
              patch({ type, padsPerGroup: type === 'strap' ? 2 : 1 });
            }}>
              {FOOTING_TYPES.map((type) => <option value={type} key={type}>{labels[type]}</option>)}
            </select>
          </label>
          <Numeric label="Same footing groups" unit="nos" value={f.count}
            onChange={(count) => patch({ count: Math.round(count) })}/>
          <label className="boq-stage-field">
            <span>Supported column IDs</span>
            <input value={f.columnRefs} placeholder="e.g. C1, C2"
              onChange={(e) => patch({ columnRefs: e.target.value })}/>
          </label>
        </div>
        {columnLabels.length > 0 && <p className="boq-footing-helper">
          Columns available: {columnLabels.join(', ')}. References link the records
          for review only; they do not automatically change footing quantities.
        </p>}
        <div className="boq-stage-input-grid">
          {f.type === 'strap' && <Numeric label="Pads per strap group" unit="nos"
            value={padUnits} min={2} onChange={(padsPerGroup) => patch({
              padsPerGroup: Math.round(padsPerGroup),
            })}/>}
          <Numeric label={f.type === 'strap' ? 'Each pad length' : 'Footing length'}
            unit="ft" value={f.lengthFeet} onChange={(lengthFeet) => patch({ lengthFeet })} />
          <Numeric label={f.type === 'strap' ? 'Each pad width' : 'Footing width'}
            unit="ft" value={f.widthFeet} onChange={(widthFeet) => patch({ widthFeet })} />
          <Numeric label="Footing thickness / centre depth"
            unit="in" value={f.thicknessIn} onChange={(thicknessIn) => patch({ thicknessIn })}/>
          <label className="boq-stage-field"><span>Concrete geometry</span>
            <select value={f.geometry}
              onChange={(e) => patch({ geometry: e.target.value as DesignFootingType['geometry'] })}>
              <option value="flat">Flat / uniform thickness</option>
              <option value="stepped">Stepped footing</option>
              <option value="sloped">Sloped / tapered footing</option>
            </select>
          </label>
        </div>
        {f.geometry !== 'flat' && <div className="boq-stage-input-grid">
          <Numeric label={f.geometry === 'stepped' ? 'Raised step length' : 'Top length'}
            unit="ft" value={f.topLengthFeet}
            onChange={(topLengthFeet) => patch({ topLengthFeet })}/>
          <Numeric label={f.geometry === 'stepped' ? 'Raised step width' : 'Top width'}
            unit="ft" value={f.topWidthFeet}
            onChange={(topWidthFeet) => patch({ topWidthFeet })}/>
          {f.geometry === 'stepped'
            ? <Numeric label="Additional step height" unit="in"
                value={f.stepThicknessIn}
                onChange={(stepThicknessIn) => patch({ stepThicknessIn })}/>
            : <Numeric label="Minimum edge thickness" unit="in"
                value={f.edgeThicknessIn}
                onChange={(edgeThicknessIn) => patch({ edgeThicknessIn })}/>}
        </div>}
        {f.type === 'strap' && <>
          <p className="boq-stage-hint">Strap beam concrete is measured separately.
            Main bars and stirrups must come from the structural engineer’s drawing;
            the BOQ will not invent those steel quantities.</p>
          <div className="boq-stage-input-grid">
            <Numeric label="Connecting beam length" unit="ft" value={f.strapLengthFeet}
              onChange={(strapLengthFeet) => patch({ strapLengthFeet })}/>
            <Numeric label="Connecting beam width" unit="in" value={f.strapWidthIn}
              onChange={(strapWidthIn) => patch({ strapWidthIn })}/>
            <Numeric label="Connecting beam depth" unit="in" value={f.strapDepthIn}
              onChange={(strapDepthIn) => patch({ strapDepthIn })}/>
          </div>
        </>}
        {f.type === 'pile_cap' && <p className="boq-stage-hint">
          This measures only the pile cap. Piles, drilling, pile steel, and soil-specific
          foundation requirements need separate engineered takeoffs.
        </p>}
        <div className="boq-footing-section-label">Footing reinforcement (as drawn)</div>
        <div className="boq-stage-input-grid">
          <label className="boq-stage-field"><span>Reinforcement arrangement</span>
            <select value={f.mesh} onChange={(e) => patch({
              mesh: e.target.value === 'double' ? 'double' : 'single',
            })}>
              <option value="single">Single mesh — bottom layer</option>
              <option value="double">Double mesh — bottom + top</option>
            </select>
          </label>
          <Numeric label="Bottom bar diameter" unit="mm" value={f.bottomBarDia}
            onChange={(bottomBarDia) => patch({ bottomBarDia })}/>
          <Numeric label="Bottom mesh spacing" unit="in" value={f.bottomSpacingIn}
            onChange={(bottomSpacingIn) => patch({ bottomSpacingIn })}/>
          {f.mesh === 'double' && <>
            <Numeric label="Top bar diameter" unit="mm" value={f.topBarDia}
              onChange={(topBarDia) => patch({ topBarDia })}/>
            <Numeric label="Top mesh spacing" unit="in" value={f.topSpacingIn}
              onChange={(topSpacingIn) => patch({ topSpacingIn })}/>
          </>}
        </div>
        <label className="boq-footing-pedestal-toggle">
          <input type="checkbox" checked={f.pedestal}
            onChange={(e) => patch({ pedestal: e.target.checked })}/>
          Include RCC pedestal with this footing
        </label>
        {f.pedestal && <div className="boq-stage-input-grid">
          <Numeric label="Pedestals per group" unit="nos" value={f.pedestalsPerGroup}
            onChange={(pedestalsPerGroup) => patch({ pedestalsPerGroup: Math.round(pedestalsPerGroup) })}/>
          <Numeric label="Pedestal width" unit="in" value={f.pedestalWidthIn}
            onChange={(pedestalWidthIn) => patch({ pedestalWidthIn })}/>
          <Numeric label="Pedestal depth" unit="in" value={f.pedestalDepthIn}
            onChange={(pedestalDepthIn) => patch({ pedestalDepthIn })}/>
          <Numeric label="Pedestal height" unit="ft" value={f.pedestalHeightFeet}
            onChange={(pedestalHeightFeet) => patch({ pedestalHeightFeet })}/>
          <Numeric label="Pedestal ring diameter" unit="mm" value={f.pedestalTieDia}
            onChange={(pedestalTieDia) => patch({ pedestalTieDia })}/>
          <Numeric label="Pedestal ring spacing" unit="in" value={f.pedestalTieSpacingIn}
            onChange={(pedestalTieSpacingIn) => patch({ pedestalTieSpacingIn })}/>
        </div>}
        <p className="boq-footing-helper">Concrete and mesh steel are calculated from
          these footing measurements. Pedestal rings are separate; column longitudinal
          bars are counted only in the Columns section.</p>
      </div>;
    })}
    <button className="boq-stage-outline" type="button"
      onClick={() => onChange([...footings, newFootingType(footings.length)])}>
      + Add footing type
    </button>
  </div>;
}
