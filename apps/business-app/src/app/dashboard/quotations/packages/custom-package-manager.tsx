'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConstructionRate } from '@business-os/database/construction-rates';
import { RateForm } from '../../pricing/construction/rates-manager';
import { saveCustomPackageSettings } from '../../pricing/construction/actions';
import './custom-package-manager.css';

type MaterialGroup = { key: string; label: string; icon: string; categories: string[] };
const GROUPS: MaterialGroup[] = [
  { key:'structural', label:'Structural Materials', icon:'▦',
    categories:['Steel','Cement','Bricks','Sand','Aggregate','Cement mix ratio'] },
  { key:'cement', label:'Cement & Binders', icon:'▤', categories:['Cement','Cement mix ratio'] },
  { key:'bricks', label:'Bricks & Blocks', icon:'▧', categories:['Bricks'] },
  { key:'sand', label:'Sand & Aggregates', icon:'♢', categories:['Sand','Aggregate'] },
  { key:'flooring', label:'Flooring', icon:'▦', categories:['Flooring','Tiles','Granite','Marble'] },
  { key:'plumbing', label:'Bathrooms & Plumbing', icon:'♧', categories:['Plumbing','Bathroom','Bathrooms'] },
  { key:'electrical', label:'Electrical', icon:'ϟ', categories:['Electrical','Wiring'] },
  { key:'painting', label:'Painting', icon:'✎', categories:['Painting','Paint'] },
  { key:'gates', label:'Railing & Gate', icon:'♜', categories:['Gate','Railing'] },
  { key:'tanks', label:'Tanks, Sump & Plinth', icon:'▥', categories:['Tank','Sump','Plinth'] },
  { key:'labour', label:'Labour & Services', icon:'♙', categories:['Labour','Supervision','Services'] },
  { key:'other', label:'Other Materials', icon:'▣',
    categories:['Other','Waterproofing'] },
];
const cash = (n: number) => new Intl.NumberFormat('en-IN', {
  style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2,
}).format(Number.isFinite(n) ? n : 0);
const amount = (n: string) => Number(n);
const qtyValid = (value: string) =>
  /^(0|[1-9][0-9]{0,3})(\.[0-9]{1,4})?$/.test(value) &&
    Number(value) > 0 && Number(value) <= 1000;
const displayedNumber = (value: number) => value.toLocaleString('en-IN', {
  minimumFractionDigits:0,maximumFractionDigits:2,
});
const groupForCategory = (category: string) =>
  GROUPS.find(group => group.categories.includes(category))?.key ?? 'other';

type MaterialRow = { category: string; options: ConstructionRate[] };
type Editor = { type:'new' | 'edit'; category:string; rate?:ConstructionRate } | null;
type BrandPicker = string | null;

export function CustomPackageManager({ rates, canManage, embedded = false }: {
  rates: ConstructionRate[];
  canManage: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [group, setGroup] = useState('structural');
  const [selected, setSelected] = useState<Record<string,string>>(() =>
    Object.fromEntries([...new Set(rates.map(r=>r.category))].flatMap(category => {
      const choices = rates.filter(r=>r.category===category && r.status==='active');
      const current = choices.find(r=>r.isDefault) ?? choices[0];
      return current ? [[category,current.id]] : [];
    })),
  );
  const [consumption, setConsumption] = useState<Record<string,string>>({});
  const [editor, setEditor] = useState<Editor>(null);
  const [brandsFor, setBrandsFor] = useState<BrandPicker>(null);
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = rates.filter(r=>r.status==='active');
  const grouped = useMemo(() => {
    const all = [...new Set(rates.map(r=>r.category))];
    return all.map(category=>({
      category,
      options: rates.filter(r=>r.category===category && r.status==='active'),
    }));
  },[rates]);
  const materialRows: MaterialRow[] = grouped.filter(row =>
    group === 'structural'
      ? GROUPS[0]!.categories.includes(row.category)
      : group === 'other'
        ? groupForCategory(row.category)==='other'
        : GROUPS.find(g=>g.key===group)?.categories.includes(row.category),
  );
  // Show material rows for brand categories not added yet; prices stay blank
  // until a company administrator enters actual figures.
  const placeholders = group === 'structural'
    ? ['Steel','Cement','Bricks','Sand','Aggregate']
    : (GROUPS.find(g=>g.key===group)?.categories ?? []);
  const displayed: MaterialRow[] = [
    ...materialRows,
    ...placeholders.filter(category=>!materialRows.some(row=>row.category===category))
      .map(category=>({category,options:[]})),
  ].sort((a,b)=>{
    const ai=placeholders.indexOf(a.category),bi=placeholders.indexOf(b.category);
    return (ai<0?100:ai)-(bi<0?100:bi) || a.category.localeCompare(b.category);
  });
  const categorySelected = (category:string,options: ConstructionRate[]) =>
    options.find(rate=>rate.id===selected[category]) ??
    options.find(rate=>rate.isDefault) ?? options[0];
  const selectionItems = grouped.flatMap(({category,options}) => {
    const item = categorySelected(category,options);
    if (!item) return [];
    const quantity = consumption[item.id] ?? item.consumptionPerSqft;
    return [{item,quantity}];
  });
  const total = selectionItems.reduce((sum,{item,quantity}) =>
    sum + (qtyValid(quantity) ? amount(item.unitPrice)*amount(quantity) : 0),0);
  const isValid = selectionItems.every(({quantity,item})=>
    qtyValid(quantity) && amount(item.unitPrice)*amount(quantity) <= 1000000);
  const isDirty = dirty && canManage;
  const currentGroup = GROUPS.find(g=>g.key===group) ?? GROUPS[0]!;
  const hasActive = active.length > 0;

  useEffect(() => {
    if (!editor && !brandsFor) return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setEditor(null);setBrandsFor(null);}
    };
    document.addEventListener('keydown',key);
    return ()=>{
      document.body.style.overflow=previous;
      document.removeEventListener('keydown',key);
    };
  },[editor,brandsFor]);

  function reset() {
    setSelected(Object.fromEntries([...new Set(active.map(r=>r.category))]
      .flatMap(category=>{
        const options=active.filter(r=>r.category===category);
        const item=options.find(r=>r.isDefault) ?? options[0];
        return item?[[category,item.id]]:[];
      })));
    setConsumption({});
    setDirty(false);
    setFeedback('Unsaved changes discarded. Saved company rates remain unchanged.');
  }
  function updateBrand(category:string,id:string){
    setSelected(old=>({...old,[category]:id}));
    setDirty(true);
    setFeedback('');
  }
  function updateQuantity(item:ConstructionRate,value:string){
    setConsumption(old=>({...old,[item.id]:value}));
    setDirty(true);
    setFeedback('');
  }
  function save(){
    if(!canManage || pending || !isValid || !selectionItems.length)return;
    setFeedback('');
    startTransition(async()=>{
      try{
        const rows=selectionItems.map(({item,quantity})=>({
          id:item.id,version:item.version,consumptionPerSqft:quantity,
        }));
        const result=await saveCustomPackageSettings(rows);
        setFeedback(result.message);
        if(result.ok){setDirty(false);setConsumption({});router.refresh();}
      }catch{
        setFeedback('Could not save material rates. Reload and try again.');
      }
    });
  }

  return <section className={'cpm ' + (embedded ? 'cpm-embedded' : '')}
      id="custom-package-management" aria-label="Custom Package Management">
    <div className="cpm-heading">
      <span className="cpm-heading-icon" aria-hidden="true">⚙</span>
      <div className="cpm-heading-copy">
        <h2>Custom Package Management</h2>
        <p>Set material consumption and brand options with unit prices.
          These company rates are used in Custom Quotes.</p>
      </div>
      <div className="cpm-heading-actions">
        <Link href="/dashboard/quotations/new?mode=custom" className="cpm-secondary">
          Create Custom Quote <span aria-hidden="true">↗</span>
        </Link>
        <Link href="/dashboard/quotations/packages/custom/preview"
          target="_blank" rel="noopener noreferrer" className={
            'cpm-secondary' + (!hasActive ? ' cpm-disabled' : '')}
          aria-disabled={!hasActive}
          onClick={event=>{if(!hasActive)event.preventDefault();}}>
          ▤ Preview Custom Package PDF
        </Link>
      </div>
    </div>
    <div className="cpm-layout">
      <nav className="cpm-categories" aria-label="Material categories">
        <h3>Material Categories</h3>
        {GROUPS.map(entry=><button type="button" key={entry.key}
          className={group===entry.key?'cpm-category cpm-current':'cpm-category'}
          aria-current={group===entry.key?'true':undefined}
          onClick={()=>setGroup(entry.key)}>
          <span aria-hidden="true" className="cpm-cat-icon">{entry.icon}</span>
          <span>{entry.label}</span>
          <span className="cpm-cat-chevron" aria-hidden="true">›</span>
        </button>)}
      </nav>
      <div className="cpm-workspace">
        <header className="cpm-workspace-heading">
          <div>
            <h3>{currentGroup.label}</h3>
            <p>Choose a brand and edit its quantity per built-up SFT.
              Saved prices are used for the custom rate.</p>
          </div>
          {canManage&&<button type="button" className="cpm-add-material"
            onClick={()=>setEditor({type:'new',category:group==='other'?'Other':
              group==='structural'?'Steel':currentGroup.categories[0]??'Other'})}>
            <span aria-hidden="true">＋</span> Add Material
          </button>}
        </header>
        <div className="cpm-table-wrap">
          <table className="cpm-table">
            <thead><tr>
              <th>Material</th><th>Consumption<br/><small>(per SFT)</small></th>
              <th>Unit</th><th>Brand Options <small>(Unit Price)</small></th>
              <th>Calculated Cost<br/><small>(per SFT)</small></th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {displayed.map(({category,options})=>{
                const item=categorySelected(category,options);
                const quantity=item?(consumption[item.id]??item.consumptionPerSqft):'';
                const cost=item&&qtyValid(quantity)?amount(item.unitPrice)*amount(quantity):0;
                return <tr key={category}>
                  <td className="cpm-material"><span className="cpm-material-icon" aria-hidden="true">▦</span>
                    <span>{category}{!options.length&&<small>No brands set</small>}</span></td>
                  <td>{item
                    ? <input className="cpm-consumption" aria-label={category+' quantity per SFT'}
                        type="number" inputMode="decimal" min=".0001" max="1000" step=".0001"
                        disabled={!canManage}
                        value={quantity}
                        onChange={e=>updateQuantity(item,e.target.value)}/>
                    : <span className="cpm-missing">—</span>}</td>
                  <td className="cpm-unit">{item?.priceUnit??'—'}</td>
                  <td className="cpm-brand-cell">{options.length>0?<>
                    <select aria-label={'Choose '+category+' brand'}
                      disabled={!canManage}
                      value={item?.id??''}
                      onChange={event=>updateBrand(category,event.target.value)}>
                      {options.map(rate=><option key={rate.id} value={rate.id}>
                        {rate.name} · {cash(amount(rate.unitPrice))}/{rate.priceUnit}
                      </option>)}
                    </select>
                    {canManage&&<div className="cpm-brand-links">
                      <button type="button" onClick={()=>setEditor({type:'new',category})}>＋ Add brand</button>
                      <button type="button" onClick={()=>setBrandsFor(category)}>Manage brands</button>
                    </div>}
                  </>:canManage
                    ? <button type="button" className="cpm-empty-brand"
                        onClick={()=>setEditor({type:'new',category})}>＋ Add brand</button>
                    : <span className="cpm-missing">Not configured</span>}</td>
                  <td className="cpm-price">{item?cash(cost):'—'}</td>
                  <td className="cpm-row-actions">
                    <button type="button" disabled={!canManage||!item}
                      title={'Edit '+category+' brand'} aria-label={'Edit '+category+' brand'}
                      onClick={()=>item&&setEditor({type:'edit',rate:item,category})}>✎</button>
                    <button type="button" disabled={!canManage||!options.length}
                      aria-label={'Manage '+category+' brands'}
                      onClick={()=>setBrandsFor(category)}>⋮</button>
                  </td>
                </tr>;
              })}
              {!displayed.length&&<tr><td colSpan={6} className="cpm-table-empty">
                No materials in this category yet. Add a material to start pricing.
              </td></tr>}
            </tbody>
          </table>
        </div>
        {!hasActive&&<p className="cpm-empty-explain" role="status">
          No brand prices have been configured yet. Add your real company material prices
          — example costs are not filled in as actual prices.
        </p>}
        {feedback&&<p className="cpm-feedback" role="status">{feedback}</p>}
        <footer className="cpm-footer">
          <div className="cpm-total">
            <small>Estimated Construction Rate (Custom)</small>
            <strong>{cash(total)} <span>per SFT</span></strong>
            <small>{selectionItems.length} material categories · Selected brand costs summed</small>
          </div>
          {canManage&&<div className="cpm-footer-actions">
            <button type="button" className="cpm-reset" onClick={reset} disabled={pending||!isDirty}>
              ↶ Reset to Saved
            </button>
            <button type="button" className="cpm-save"
              disabled={pending||!isDirty||!isValid||!selectionItems.length}
              onClick={save}>
              {pending?'Saving…':'▣ Save Changes'}
            </button>
          </div>}
        </footer>
      </div>
    </div>
    {(editor||brandsFor)&&<div className="cpm-modal-backdrop"
      onMouseDown={e=>{if(e.target===e.currentTarget){setEditor(null);setBrandsFor(null);}}}>
      <section role="dialog" aria-modal="true" aria-label={
        editor?'Edit material and brand price':'Manage brand options'} className="cpm-modal">
        <button type="button" className="cpm-modal-close" aria-label="Close"
          onClick={()=>{setEditor(null);setBrandsFor(null);}}>×</button>
        {editor&&<>
          <h3>{editor.rate?'Edit Brand & Unit Price':'Add Material / Brand'}</h3>
          <p>Set the exact company material unit price and consumption.
            Any issued quotations retain their previous saved price snapshot.</p>
          <RateForm key={(editor.rate?.id??editor.category)+':'+(editor.rate?.version??'new')}
            {...(editor.rate?{rate:editor.rate}:{})}
            initialCategory={editor.category}
            close={()=>{setEditor(null);router.refresh();}}/>
        </>}
        {brandsFor&&<>
          <h3>{brandsFor} · Manage brands</h3>
          <p>Each material can have several brands and unit prices.
            Choose a preferred brand in the table; the customer can change it in their quote.</p>
          <div className="cpm-brand-management">
            {rates.filter(r=>r.category===brandsFor).map(rate=>
              <div key={rate.id} className="cpm-brand-management-item">
                <span><strong>{rate.name}</strong>
                  <small>{cash(amount(rate.unitPrice))}/{rate.priceUnit}
                    {' '} · {rate.consumptionPerSqft}/{rate.priceUnit} per SFT · {rate.status}</small>
                </span>
                {canManage&&<button type="button"
                  onClick={()=>{setEditor({type:'edit',rate,category:brandsFor});setBrandsFor(null);}}>Edit</button>}
              </div>)}
          </div>
          {canManage&&<button type="button" className="cpm-add-material"
            onClick={()=>{setEditor({type:'new',category:brandsFor});setBrandsFor(null);}}>
            ＋ Add another brand</button>}
        </>}
      </section>
    </div>}
  </section>;
}
