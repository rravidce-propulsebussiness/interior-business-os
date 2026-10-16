'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { calculateSftEstimate, type SftEstimateDetails } from '@business-os/core/sft-quotation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { saveFloorwiseSftEstimate } from './construction-actions';
import { QuotationPdfControls } from './quotation-pdf-controls';
import { FLOOR_RATE_TITLE, readFloorRateDefaults } from '../pricing/construction/floor-rate-rules';
import { propagateFloorChanges, followPreviousFloor, restoreFloorFollowing } from './construction-floor-inheritance';
import { sftEstimateInputSchema } from '@business-os/core/sft-quotation';

type Unit = 'sqft' | 'wall_sqft' | 'running_ft' | 'cubic_ft' | 'piece' | 'lumpsum';
type Work = {
  kind: 'floor' | 'additional';
  name: string;
  lengthFeet: string;
  widthFeet: string;
  heightFeet?: string;
  quantity?: string | undefined;
  unit?: Unit;
  ratePerSqft: string;
  inheritFromPrevious?: boolean | undefined;
};
type Material = {
  title: string;
  description: string;
  brand?: string;
  grade?: string;
  allowancePerSqft?: string;
};
const names = [
  'Ground Floor','First Floor','Second Floor','Third Floor',
  'Fourth Floor','Fifth Floor','Sixth Floor','Seventh Floor',
];
type FloorZone = 'construction' | 'parking' | 'penthouse';
const floorLabel = (level: number) => names[level] ?? 'Floor';
const floorZoneName = (level: number, zone: FloorZone) =>
  floorLabel(level) + (zone === 'construction' ? '' :
    zone === 'parking' ? ' — Parking' : ' — Penthouse');
const floorLevel = (name: string) =>
  names.findIndex(n => name === n || name.startsWith(n + ' — '));
const floorZone = (name: string): FloorZone =>
  name.endsWith(' — Parking') ? 'parking' :
    name.endsWith(' — Penthouse') ? 'penthouse' : 'construction';
const commonWorks: { name:string; unit:Unit }[] = [
  {name:'Shelves & Sajjas',unit:'sqft'},
  {name:'Compound Wall',unit:'wall_sqft'},
  {name:'Staircase / Headroom',unit:'lumpsum'},
  {name:'External Portico / Canopy',unit:'sqft'},
  {name:'Overhead Tank Platform',unit:'sqft'},
  {name:'Elevation Works',unit:'sqft'},
  {name:'Water Sump',unit:'lumpsum'},
  {name:'Septic Tank',unit:'piece'},
  {name:'Borewell',unit:'running_ft'},
  {name:'Rainwater Harvesting',unit:'lumpsum'},
  {name:'Retaining Wall',unit:'wall_sqft'},
  {name:'Lift',unit:'piece'},
  {name:'Other Work',unit:'sqft'},
];
const fmt = (n:number) => new Intl.NumberFormat('en-IN',{
  style:'currency',currency:'INR',maximumFractionDigits:0,
}).format(Number.isFinite(n)?n:0);
const work = (name:string,unit:Unit,rate=''):Work => ({
  kind:'additional',name,unit,ratePerSqft:rate,
  lengthFeet:unit==='piece'||unit==='lumpsum'?'1':'',widthFeet:unit==='sqft'||unit==='cubic_ft'?'':'1',
  heightFeet:'',quantity:unit==='piece'||unit==='lumpsum'?'1':'',
});
const floor = (name:string,rate=''):Work => ({
  kind:'floor',name,lengthFeet:'',widthFeet:'',heightFeet:'',
  unit:'sqft',ratePerSqft:rate,
});
const defaultSpecs = [
  'Architectural plans & drawings','Foundation, footings & structural work',
  'Steel','Cement','Bricks, sand & aggregate','Kitchen & platform',
  'Doors, windows & hardware','Bathroom, plumbing & waterproofing',
  'Flooring, tiles & staircase','Interior & exterior painting',
  'Electrical work','Elevation, railings & metal works',
  'Water tanks, sump & miscellaneous','Exclusions, warranty & site handover',
];
const labelUnit=(unit:Unit)=>({
  sqft:'SFT',wall_sqft:'SFT',running_ft:'RFT',cubic_ft:'CFT',piece:'Nos',lumpsum:'LS',
})[unit];
const measured = (row:Work) => {
  const L=Number(row.lengthFeet),W=Number(row.widthFeet),H=Number(row.heightFeet),Q=Number(row.quantity);
  const unit=row.unit??'sqft';
  if(unit==='lumpsum')return 1;
  if(unit==='piece')return Number.isFinite(Q)?Q:0;
  if(unit==='running_ft')return Number.isFinite(L)?L:0;
  if(unit==='wall_sqft')return (Number.isFinite(L)?L:0)*(Number.isFinite(H)?H:0);
  if(unit==='cubic_ft')return (Number.isFinite(L)?L:0)*(Number.isFinite(W)?W:0)*(Number.isFinite(H)?H:0);
  return (Number.isFinite(L)?L:0)*(Number.isFinite(W)?W:0);
};
const nonempty=(s:string|undefined)=>Boolean(s?.trim());

export function PremiumSftBuilder({
  rates,packages,initialSchedule,revisionId,version,selectedPackageId,quoteNumber,canSharePdf,
}:{
  rates:ConstructionRate[];
  packages:ConstructionPackage[];
  initialSchedule:SftEstimateDetails|null;
  revisionId:string; version:number; selectedPackageId?:string; quoteNumber:string; canSharePdf:boolean;
}){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const activePackages=packages.filter(p=>p.status==='active');
  const previous=activePackages.find(p=>p.id===initialSchedule?.package?.id||p.code===initialSchedule?.package?.code);
  const selectedPackage=activePackages.find(p=>p.id===selectedPackageId)??previous;
  const changedPackage=Boolean(selectedPackage&&previous?.id!==selectedPackage.id);
  const packageRate=selectedPackage?.ratePerSqft??'';
  const floorRateDefaults=readFloorRateDefaults(selectedPackage?.specSections??[]);
  const activeRates=rates.filter(r=>r.status==='active');
  const [rows,setRows]=useState<Work[]>(()=>{
    const initial=initialSchedule?.rows;
    if(!initial?.length)return [floor('Ground Floor',packageRate)];
    return initial.map((item, index)=>({
      // Existing legacy floor rows remain editable; special zone names are
      // persisted inside the existing signed floor-wise quotation schedule.
      ...item,
      name:(item.kind??'floor')==='floor' && floorLevel(item.name)<0
        ? floorLabel(index) : item.name,
      kind:item.kind??'floor',
      unit:item.unit??'sqft',
      heightFeet:item.heightFeet??'',
      quantity:item.quantity??'',
      inheritFromPrevious:(item.kind??'floor')==='floor' &&
        floorLevel(item.name)>0 && floorZone(item.name)==='construction'
        ? item.inheritFromPrevious!==false : item.inheritFromPrevious,
      ratePerSqft:changedPackage&&(item.kind??'floor')==='floor'
        ?(floorZone(item.name)==='parking' ? floorRateDefaults.parking :
          floorZone(item.name)==='penthouse' ? floorRateDefaults.penthouse : packageRate)
        :item.ratePerSqft,
    }));
  });
  const [sections,setSections]=useState<Material[]>(()=>{
    if(selectedPackage&&(changedPackage||!initialSchedule?.sections?.length)){
      const packageSpecs=selectedPackage.specSections.filter(s=>s.title!==FLOOR_RATE_TITLE);
      const configured=packageSpecs.length?packageSpecs.map(s=>({
        title:s.title,description:s.description,brand:s.brand,
        grade:s.grade,allowancePerSqft:s.allowancePerSqft,
      })):defaultSpecs.map(title=>({title,description:'',brand:'',grade:'',allowancePerSqft:''}));
      return [...(configured.length < 18
        ? [{title:'Package scope & inclusions',description:selectedPackage.description}]
        : []), ...configured].slice(0,18);
    }
    return initialSchedule?.sections?.filter(s=>s.title!==FLOOR_RATE_TITLE).map(s=>({...s}))??[];
  });
  const [materialIds,setMaterialIds]=useState<string[]>(()=>{
    if(changedPackage)return [];
    return (initialSchedule?.materials??[]).flatMap(m=>{
      const found=activeRates.find(r=>r.category===m.category&&r.name===m.name&&r.specification===m.specification);
      return found?[found.id]:[];
    });
  });
  const [drawer,setDrawer]=useState(false);
  const [draftSections,setDraftSections]=useState<Material[]>([]);
  const openMaterials=()=>{setDraftSections(sections.map(s=>({...s})));setDrawer(true);};
  const cancelMaterials=()=>{setDraftSections([]);setDrawer(false);};
  const [message,setMessage]=useState('');
  const [saved,setSaved]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [savedVersion,setSavedVersion]=useState(version);
  useEffect(()=>{setSavedVersion(version);},[version]);
  const floors=rows.filter(r=>r.kind==='floor');
  const extras=rows.filter(r=>r.kind==='additional');
  const levels=names.map((name,level)=>({
    level, name, portions:floors.filter(r=>floorLevel(r.name)===level),
  })).filter(g=>g.portions.length>0);
  const floorCount=levels.length;
  const usedMaterials=activeRates.filter(r=>materialIds.includes(r.id))
    .map(r=>({category:r.category,name:r.name,specification:r.specification}));
  const stale=(changedPackage?[]:initialSchedule?.materials??[]).filter(m=>
    !activeRates.some(r=>r.category===m.category&&r.name===m.name&&r.specification===m.specification)&&
    !sections.some(s=>s.title.toLowerCase().includes(m.category.toLowerCase())&&nonempty(s.brand)));
  const estimate=(()=>{
    try{return calculateSftEstimate({
      rows,materialIds,packageId:selectedPackage?.id??null,sections,
    },usedMaterials);}catch{return null;}
  })();
  const total=floors.reduce((sum,r)=>sum+measured(r)*Number(r.ratePerSqft||0),0)+
    extras.reduce((sum,r)=>sum+measured(r)*Number(r.ratePerSqft||0),0);
  const area=floors.reduce((sum,r)=>sum+measured(r),0);
  const displayedTotal=estimate?Number(estimate.total):total;
  const savePayload={
    rows,materialIds,packageId:selectedPackage?.id??null,
    sections:sections.filter(s=>nonempty(s.description)||nonempty(s.brand)||
      nonempty(s.grade)||nonempty(s.allowancePerSqft)),
  };
  const parsedInput=sftEstimateInputSchema.safeParse(savePayload);
  const validationMessage=(()=>{
    if(!parsedInput.success){
      const problem=parsedInput.error.issues[0];
      const index=typeof problem?.path[1]==='number'&&problem.path[0]==='rows'
        ?problem.path[1]:null;
      const name=index!==null?rows[index]?.name:null;
      const field=problem?.path.at(-1);
      const fieldLabel=field==='lengthFeet'?'length':field==='widthFeet'?'width':
        field==='heightFeet'?'height':field==='ratePerSqft'?'rate':
        field==='name'?'work description':'details';
      return (name ? name+': ' : '')+'Please enter a valid '+fieldLabel+
        ' before saving the quotation.';
    }
    if(stale.length)return 'A previously selected material is unavailable. Update it before saving.';
    if(activePackages.length&&!selectedPackage)return 'Choose a construction package before saving.';
    if(!estimate)return 'Enter valid areas and a positive construction amount before saving.';
    return '';
  })();
  const touch=()=>{setSaved(false);setDirty(true);setMessage('');};
  const updateRow=(index:number,patch:Partial<Work>)=>{
    setRows(current=>propagateFloorChanges(current,index,patch));touch();
  };
  const restoreFollowing=(level:number)=>{
    setRows(current=>restoreFloorFollowing(current,level));touch();
  };
  const setFloors=(num:number)=>{
    const count=Math.max(1,Math.min(8,num));
    const kept=floors.filter(r=>{
      const level=floorLevel(r.name);
      return level<0 || level<count;
    });
    let next=[...kept];
    for(let level=0;level<count;level++){
      if(next.some(r=>floorLevel(r.name)===level))continue;
      const previous=next.filter(r=>floorLevel(r.name)===level-1);
      const construction=previous.find(r=>floorZone(r.name)==='construction');
      const combinedArea=previous.reduce((sum,r)=>sum+measured(r),0);
      const copied=construction && previous.length===1
        ?{lengthFeet:construction.lengthFeet,widthFeet:construction.widthFeet}
        :combinedArea>0
          ?{lengthFeet:String(Number(combinedArea.toFixed(2))),widthFeet:'1'}
          :{lengthFeet:'',widthFeet:''};
      next.push({...floor(floorZoneName(level,'construction'),construction?.ratePerSqft || packageRate),
        ...copied,inheritFromPrevious:level>0});
    }
    if(next.length+extras.length>18){
      setMessage('Too many floor portions and extra works (maximum 18 rows).');
      return;
    }
    const restored=[...next,...extras];
    // Carry linked floor-area changes through every newly added upper floor.
    let propagated=restored;
    for(let level=1;level<count;level++) propagated=followPreviousFloor(propagated,level);
    setRows(propagated);
    touch();
  };
  const addFloorZone=(level:number,zone:FloorZone)=>{
    if(rows.length>=18)return;
    if(floors.some(r=>r.name===floorZoneName(level,zone)))return;
    const defaultRate=zone==='parking' ? floorRateDefaults.parking :
      zone==='penthouse' ? floorRateDefaults.penthouse : packageRate;
    const item={...floor(floorZoneName(level,zone),defaultRate)};
    const where=rows.reduce((index,r,i)=>
      r.kind==='floor'&&floorLevel(r.name)===level ? i:index,-1);
    setRows(current=>[
      ...current.slice(0,where+1),item,...current.slice(where+1),
    ]);
    touch();
  };
  const addExtra=(name:string)=>{
    if(!name||rows.length>=18)return;
    const preset=commonWorks.find(x=>x.name===name);
    setRows([...rows,work(name,preset?.unit??'sqft')]);touch();
  };
  const updateMaterial=(index:number,patch:Partial<Material>)=>{
    setDraftSections(curr=>curr.map((m,i)=>i===index?{...m,...patch}:m));
  };
  const applyMaterials=()=>{
    // Snapshot changed specifications on the quotation only; master package
    // definitions and prices remain intact.
    const changed=sections.filter((previous,i)=>{
      const current=draftSections[i];
      return current && (current.brand!==previous.brand||
        current.description!==previous.description||current.grade!==previous.grade);
    });
    setSections(draftSections.map(m=>({...m})));
    if(changed.length) setMaterialIds(curr=>curr.filter(id=>{
      const rate=activeRates.find(r=>r.id===id);
      return !rate||!changed.some(spec=>
        spec.title.toLowerCase().includes(rate.category.toLowerCase()));
    }));
    setDrawer(false);setDraftSections([]);touch();
  };
  const save=()=>{
    if(pending)return;
    if(validationMessage){
      setMessage(validationMessage);
      setSaved(false);
      return;
    }
    startTransition(async()=>{
      try{
        const response=await saveFloorwiseSftEstimate(revisionId,savedVersion,savePayload);
        setMessage(response.message);
        setSaved(Boolean(response.id));
        if(response.id){
          setSavedVersion(response.version??savedVersion+1);
          setDirty(false);
          setDrawer(false);
          router.refresh();
        }
      }catch{
        setSaved(false);
        setMessage('Could not save the quotation. Please try again or reload this page.');
      }
    });
  };
  return <div className="qs-workflow">
    <section className="qs-work-card qs-work-card-table">
      <div className="qs-work-heading">
        <div className="qs-work-heading-icon">▥</div>
        <div><h3>Work details</h3><p>Add floors and construction items with exact dimensions and rates.</p></div>
        <span className="qs-work-unit-badge">SFT <span>· ft</span></span>
      </div>
      <div className="qs-work-floor-tabs" role="group" aria-label="Construction floors">
        {[1,2,3,4].map(n=><button type="button" key={n}
          aria-pressed={floorCount===n}
          className={floorCount===n?'active':''} onClick={()=>setFloors(n)}>
          {n===1?'G only':'G+'+(n-1)}</button>)}
        <button type="button" disabled={floorCount>=8||rows.length>=18}
          onClick={()=>setFloors(floorCount+1)}>+ Add floor</button>
      </div>
      <div className="qs-work-floor-splits">
        {levels.map(group=><div className="qs-work-split" key={group.level}>
          <div>
            <strong>{group.name}</strong>
            <small>{group.portions.reduce((sum,r)=>sum+measured(r),0).toLocaleString('en-IN',{
              maximumFractionDigits:2,
            })} SFT · construction / parking / penthouse separately priced</small>
          </div>
          <div className="qs-work-split-buttons">
            {group.level>0&&group.portions.some(r=>floorZone(r.name)==='construction')&&
              <label className="qs-work-floor-follow">
                <input type="checkbox"
                  aria-label={group.name+' follow previous floor'}
                  checked={group.portions.find(r=>floorZone(r.name)==='construction')?.inheritFromPrevious!==false}
                  onChange={event=>{
                    if(event.target.checked) restoreFollowing(group.level);
                    else {
                      setRows(current=>current.map(row=>
                        row.kind==='floor'&&floorLevel(row.name)===group.level&&floorZone(row.name)==='construction'
                          ? {...row,inheritFromPrevious:false}:row));
                      touch();
                    }
                  }}/>
                Follow lower floor
              </label>}
            {!group.portions.some(r=>floorZone(r.name)==='construction') &&
              <button type="button" disabled={rows.length>=18}
                onClick={()=>addFloorZone(group.level,'construction')}>＋ Construction</button>}
            {!group.portions.some(r=>floorZone(r.name)==='parking') &&
              <button type="button" disabled={rows.length>=18}
                onClick={()=>addFloorZone(group.level,'parking')}>＋ Parking</button>}
            {!group.portions.some(r=>floorZone(r.name)==='penthouse') &&
              <button type="button" disabled={rows.length>=18}
                onClick={()=>addFloorZone(group.level,'penthouse')}>＋ Penthouse</button>}
          </div>
        </div>)}
      </div>
      <p className="qs-work-copy-hint">
        Upper floors follow changes to the floor below until you untick Follow lower floor or
        edit that upper floor yourself. Parking and penthouse rates stay independent.
      </p>
      <div className="qs-work-table-scroll" role="region" aria-label="Work quantities and rates" tabIndex={0}>
        <table className="qs-work-table">
          <thead><tr>
            <th>#</th><th>Work item</th><th>Length (ft)</th><th>Width (ft)</th>
            <th>Height (ft)</th><th>Area / Qty</th><th>Rate (₹)</th><th>Amount (₹)</th><th></th>
          </tr></thead>
          <tbody>{rows.map((r,i)=>{
            const u=r.unit??'sqft';
            const qty=measured(r);
            const amount=qty*Number(r.ratePerSqft||0);
            const piece=u==='piece'||u==='lumpsum';
            const lengthUsed=!piece;
            const widthUsed=u==='sqft'||u==='cubic_ft';
            const heightUsed=u==='wall_sqft'||u==='cubic_ft';
            return <tr key={r.kind+':'+r.name+':'+i}>
              <td><span className="qs-work-index">{String(i+1).padStart(2,'0')}</span></td>
              <td className="qs-work-name"><input aria-label={'Item '+(i+1)+' name'}
                value={r.name} maxLength={90}
                readOnly={r.kind==='floor'}
                onChange={e=>updateRow(i,{name:e.target.value})}/>
                {r.kind==='additional'&&<select aria-label={'Unit for '+r.name}
                  value={u} onChange={e=>updateRow(i,{unit:e.target.value as Unit,
                    widthFeet:e.target.value==='sqft'||e.target.value==='cubic_ft'?'':'1',
                    quantity:e.target.value==='piece'||e.target.value==='lumpsum'?'1':undefined})}>
                  <option value="sqft">SFT</option><option value="wall_sqft">Wall SFT</option>
                  <option value="running_ft">Running ft</option><option value="cubic_ft">Cubic ft</option>
                  <option value="piece">Per piece</option><option value="lumpsum">Lump sum</option>
                </select>}
              </td>
              {([
                ['lengthFeet',lengthUsed],['widthFeet',widthUsed],['heightFeet',heightUsed],
              ] as const).map(([field,used])=><td key={field}>
                <input aria-label={r.name+' '+field} type="number" inputMode="decimal"
                  min="0.01" max="9999.99" step="0.01"
                  disabled={!used} placeholder={used?'0':'—'}
                  value={used?r[field]??'':''}
                  onChange={e=>updateRow(i,{[field]:e.target.value})}/>
              </td>)}
              <td>{piece?<input type="number" aria-label={r.name+' quantity'} inputMode="decimal"
                  min=".01" max="9999.99" step=".01" value={u==='lumpsum'?'1':r.quantity??''}
                  disabled={u==='lumpsum'}
                  onChange={e=>updateRow(i,{quantity:e.target.value})}/>
                :<strong className="qs-work-qty">{qty>0?Number(qty.toFixed(2)).toLocaleString('en-IN'):'—'}</strong>}
                <small className="qs-work-unit">{labelUnit(u)}</small>
              </td>
              <td><input type="number" aria-label={r.name+' rate'} inputMode="decimal"
                min="0" max="999999.99" step=".01" placeholder="₹/unit"
                value={r.ratePerSqft} onChange={e=>updateRow(i,{ratePerSqft:e.target.value})}/></td>
              <td className="qs-work-amount">{amount>0?fmt(amount):'—'}</td>
              <td>{(r.kind==='additional'||(r.kind==='floor'&&
                (floorZone(r.name)!=='construction'||
                  floors.filter(f=>floorLevel(f.name)===floorLevel(r.name)).length>1))) &&
                <button type="button" className="qs-work-remove"
                aria-label={'Remove '+r.name} onClick={()=>{setRows(old=>old.filter((_,j)=>j!==i));touch();}}>×</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="qs-work-add">
        <label><span className="qs-work-plus">＋</span>
          <span>Add work item</span>
          <select aria-label="Add construction work item" value=""
            disabled={rows.length>=18}
            onChange={e=>addExtra(e.target.value)}>
            <option value="">Choose item…</option>
            {commonWorks.map(item=><option value={item.name} key={item.name}>{item.name}</option>)}
          </select>
        </label>
        <small>Shelves &amp; Sajjas, compound wall, staircase, portico and more</small>
      </div>
    </section>

    <section className="qs-work-card">
      <div className="qs-work-heading">
        <div className="qs-work-heading-icon">◇</div>
        <div><h3>Material brands</h3><p>Edit every package specification for this quotation only.</p></div>
        <button type="button" className="qs-work-edit" onClick={openMaterials}>✎ Edit all materials</button>
      </div>
      <div className="qs-work-material-grid">
        {sections.filter(s=>s.title!=='Package scope & inclusions'&&s.title!==FLOOR_RATE_TITLE).map((s,i)=>
          <button type="button" key={s.title+':'+i} className="qs-work-material"
            onClick={openMaterials}>
            <span className="qs-work-material-icon">▣</span>
            <span><strong>{s.title}</strong>
              <small>{s.brand||s.grade||s.description||'As per package'}</small>
              <em>Quote-only editable</em>
            </span><span className="qs-work-chevron">⌄</span>
          </button>)}
        <button type="button" className="qs-work-material-add" onClick={openMaterials}>
          ＋ Add / Edit more materials
        </button>
      </div>
      {stale.length>0&&<p className="qs-work-alert">Some previous company-rate choices are inactive. Update affected material specifications before saving.</p>}
    </section>

    <section className="qs-work-card qs-work-preview-card" aria-label="Quotation PDF actions">
      <div className="qs-work-heading">
        <div className="qs-work-heading-icon">▤</div>
        <div><h3>Quotation PDF</h3>
          <p>View, download or send the saved PDF directly through WhatsApp.</p></div>
      </div>
      <QuotationPdfControls
        revisionId={revisionId} version={version}
        quoteNumber={quoteNumber} dirty={dirty} canShare={canSharePdf}
      />
    </section>

    <div className="qs-work-summary" aria-label="Construction quotation total">
      <div className="qs-work-summary-info">
        <small>Total estimate · {floorCount} floors · {area.toLocaleString('en-IN',{maximumFractionDigits:2})} SFT</small>
        <strong>{displayedTotal>0?fmt(displayedTotal):'Enter dimensions'}</strong>
      </div>
      <button data-studio-save="quote" type="button" className="qs-work-summary-save"
        onClick={save} disabled={pending}>{pending?'Saving…':'▣ Save quotation →'}</button>
      {message&&<p className="qs-work-save-message" role="status">{message}</p>}
      {saved&&<p className="qs-work-save-message">Saved. Your PDF preview is ready to open.</p>}
    </div>

    {drawer&&<div className="qs-work-drawer-backdrop"
      onClick={e=>{if(e.target===e.currentTarget)cancelMaterials();}}>
      <section role="dialog" aria-modal="true" aria-label="Edit quotation materials"
        className="qs-work-drawer">
        <div className="qs-work-drawer-head">
          <div><h3>Edit all material specifications</h3>
            <p>All changes affect this quotation only. The master package remains untouched.</p></div>
          <button type="button" aria-label="Close materials editor" onClick={cancelMaterials}>✕</button>
        </div>
        <div className="qs-work-drawer-scroll">
          {draftSections.map((s,i)=><details key={i} className="qs-work-spec-entry">
            <summary>{s.title}<span>⌄</span></summary>
            <div>
              <label>Specification name<input maxLength={90} value={s.title}
                onChange={e=>updateMaterial(i,{title:e.target.value})}/></label>
              <label>Brand / manufacturer<input maxLength={120} value={s.brand??''}
                list={'qs-material-options-'+i}
                onChange={e=>updateMaterial(i,{brand:e.target.value})}/></label>
              <datalist id={'qs-material-options-'+i}>
                {[...new Set(activeRates.filter(rate=>
                  rate.category.toLowerCase().includes(s.title.toLowerCase())||
                  s.title.toLowerCase().includes(rate.category.toLowerCase()))
                  .map(rate=>rate.name))].map(v=><option key={v} value={v}/>)}
              </datalist>
              <label>Grade / model<input maxLength={120} value={s.grade??''}
                onChange={e=>updateMaterial(i,{grade:e.target.value})}/></label>
              <label>Allowance (if applicable)<input maxLength={40} value={s.allowancePerSqft??''}
                onChange={e=>updateMaterial(i,{allowancePerSqft:e.target.value})}/></label>
              <label className="qs-work-spec-wide">Description / included materials
                <textarea rows={3} maxLength={1100} value={s.description}
                  onChange={e=>updateMaterial(i,{description:e.target.value})}/></label>
            </div>
          </details>)}
          {draftSections.length<18&&<button type="button" className="qs-work-add-material"
            onClick={()=>{setDraftSections(prev=>[...prev,{
              title:'New material',description:'',brand:'',grade:'',allowancePerSqft:'',
            }]);}}>＋ Add another material / specification</button>}
          <p className="qs-work-drawer-hint">
            These are specification inclusions. A brand change does not silently alter the package rate.
            Use the work table to add separately priced items.
          </p>
        </div>
        <div className="qs-work-drawer-actions">
          <button type="button" onClick={cancelMaterials}>Cancel</button>
          <button type="button" onClick={applyMaterials}>
            Apply to this quotation</button>
        </div>
        <p className="qs-work-drawer-footer">Tap Save quotation to persist changes.</p>
      </section>
    </div>}
  </div>;
}
