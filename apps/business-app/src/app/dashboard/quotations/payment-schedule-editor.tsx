'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savedStagePaymentPlan,savedStagePaymentLinks } from '@business-os/core/quotation-payment-plan';
import { proposedConstructionPayments } from '@business-os/core/construction-payment-schedule';
import { savedStageRequirements,mergeStageRequirementOverrides,encodeStageRequirements,validateStageRequirementsDraft,remapStageFlowPayments,
 type StageRequirements,type StageRequirementsMap } from '@business-os/core/quotation-stage-requirements';
import { StageRequirementsEditor } from './stage-requirements-editor';

type Milestone = { name: string; percent: string; stageCodes: string[] };
type Feedback = { type: 'success' | 'error'; text: string } | null;
const MAX_STAGES = 40;

const templates: Record<string, Milestone[]> = {
  interior: [
    { name: 'Agreement & advance', percent: '20', stageCodes: [] },
    { name: 'Design approval', percent: '20', stageCodes: [] },
    { name: 'Material procurement', percent: '30', stageCodes: [] },
    { name: 'Installation', percent: '20', stageCodes: [] },
    { name: 'Handover', percent: '10', stageCodes: [] },
  ],
};

function suggestions(industry: string, floors: readonly string[]): Milestone[] {
  if(industry==='construction')
    return floors.length?proposedConstructionPayments(floors).map(row=>({...row})):[];
  return (templates[industry] ?? templates.interior)!.map(row=>({...row,stageCodes:[...row.stageCodes]}));
}

function readPlan(terms: string, industry: string, editable: boolean,floors: readonly string[]): Milestone[] {
  const saved=savedStagePaymentPlan(terms);
  const links=savedStagePaymentLinks(terms);
  if(saved)return saved.map((row,index)=>({
    name:row.name,percent:String(row.percent),stageCodes:links?.[index]??[],
  }));
  // Suggestions are editable only, never part of the PDF before explicitly saved.
  return editable?suggestions(industry,floors):[];
}

function moveStage(rows: Milestone[], from: number, to: number): Milestone[] {
  if (from < 0 || to < 0 || from >= rows.length || to >= rows.length || from === to) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + '%';
}

export function PaymentScheduleEditor({
  industry, total, currency, editable, initial, floorNames=[],
}: {
  industry: string;
  floorNames?: string[];
  total: string;
  currency: string;
  editable: boolean;
  initial: {
    revision_id: string;
    version: number;
    terms: string;
    valid_until: string;
    customer_notes: string;
    internal_notes: string;
    discount: unknown;
  };
}) {
  const [rows, setRows] = useState<Milestone[]>(() => readPlan(initial.terms, industry, editable, floorNames));
  const [stageRequirements,setStageRequirements]=useState<StageRequirementsMap>(
    ()=>savedStageRequirements(initial.terms));
  const stageCodes=[...new Set(rows.flatMap(row=>row.stageCodes))];
  // Removing a payment milestone can remove its last referenced work stage.
  // Silently discard only the now-orphaned customizations; retain those still linked.
  const visibleRequirements=Object.fromEntries(Object.entries(stageRequirements)
    .filter(([code])=>stageCodes.includes(code))) as StageRequirementsMap;
  function candidateRequirements(candidate:StageRequirementsMap):StageRequirementsMap|null{
   try{
    const onlyLinked=Object.fromEntries(Object.entries(candidate).filter(([code])=>
      stageCodes.includes(code))) as StageRequirementsMap;
    // Allow legacy issued 2-character checks in unchanged stages while
    // editing another stage. Count/size checks still apply to the entire draft.
    // New saves must pass the strict check-title rule.
    validateStageRequirementsDraft(onlyLinked);
    for(const [code,item] of Object.entries(onlyLinked)){
     for(const step of item.flow??[]){
      if(step.kind==='payment'&&(!rows[step.index]||
       !rows[step.index]!.stageCodes.includes(code)))
       throw new Error('The linked payment must belong to '+code+'. Choose a valid milestone.');
     }
    }
    return onlyLinked;
   }catch(error){
    setFeedback({type:'error',text:error instanceof Error?error.message:
      'These stage requirements exceed the quotation limits.'});
    return null;
   }
  }
  function editRequirements(code:string,value:StageRequirements){
   try{
    const changed=mergeStageRequirementOverrides(visibleRequirements,code,value);
    const next=candidateRequirements(changed);
    if(next){setStageRequirements(next);setFeedback(null);}
   }catch(error){
    setFeedback({type:'error',text:error instanceof Error?error.message:
      'Unable to update this stage. Check the entered requirements.'});
   }
  }
  function applyRelated(code:string,value:StageRequirements){
   const related=stageCodes.filter(item=>item.split('/')[0]===code.split('/')[0]);
   try{
    let candidate=visibleRequirements;
    for(const stage of related)candidate=mergeStageRequirementOverrides(candidate,stage,value);
    const next=candidateRequirements(candidate);
    if(next){setStageRequirements(next);setFeedback(null);}
   }catch(error){
    setFeedback({type:'error',text:error instanceof Error?error.message:
      'Unable to apply requirements to every floor.'});
   }
  }
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();
  const dragging = useRef<number | null>(null);
  const router = useRouter();
  const savedPlan = savedStagePaymentPlan(initial.terms);
  const hasChanges = JSON.stringify(rows) !== JSON.stringify(readPlan(initial.terms, industry, editable, floorNames))
    || JSON.stringify(visibleRequirements)!==JSON.stringify(savedStageRequirements(initial.terms));
  const percentTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0),
    [rows],
  );
  const valid = rows.length > 0 && rows.length <= MAX_STAGES
    && rows.every((row) => row.name.trim().length >= 2 && row.name.trim().length <= 100
      && Number.isFinite(Number(row.percent)) && Number(row.percent) > 0
      && Number(row.percent) <= 100 && /^\d+(?:\.\d{1,2})?$/.test(row.percent))
    && Math.abs(percentTotal - 100) < 0.001;
  const amount = Number(total);
  const money = (value: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  const stageAmounts = useMemo(() => {
    const cents = Math.round((Number.isFinite(amount) ? amount : 0) * 100);
    let allocated = 0;
    return rows.map((row, index) => {
      const calculated = Math.round(cents * (Number(row.percent) || 0) / 100);
      // The last installment absorbs penny rounding so 100% equals the quote total.
      const value = valid && index === rows.length - 1 ? cents - allocated : calculated;
      allocated += value;
      return value / 100;
    });
  }, [amount, rows, valid]);

  function update(index: number, key: keyof Milestone, value: string) {
    setFeedback(null);
    setRows((all) => all.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }

  // Payment flow steps reference existing payment rows: remap when rows move.
  function remapMilestones(next:Milestone[],mapping:(oldIndex:number)=>number|null){
   setRows(next);
   setStageRequirements(previous=>remapStageFlowPayments(previous,mapping));
   setFeedback(null);
  }
  function reorderMilestones(from:number,to:number){
   const next=moveStage(rows,from,to);
   remapMilestones(next,oldIndex=>{
    const old=rows[oldIndex];
    if(!old)return null;
    const found=next.indexOf(old);
    return found<0?null:found;
   });
  }
  function removeMilestone(index:number){
   remapMilestones(rows.filter((_,i)=>i!==index),oldIndex=>
    oldIndex===index?null:oldIndex>index?oldIndex-1:oldIndex);
  }
  function resetMilestones(){
   remapMilestones(suggestions(industry,floorNames),()=>null);
  }
  function addStage() {
    if (rows.length >= MAX_STAGES) return;
    setFeedback(null);
    setRows((all) => [...all, { name: '', percent: '', stageCodes: [] }]);
  }

  function save() {
    if (pending || !editable) return;
    if(candidateRequirements(visibleRequirements)===null)return;
    try{
      encodeStageRequirements(visibleRequirements);
    }catch(error){
      const invalid=Object.entries(visibleRequirements).filter(([,item])=>
        item.checks.some(title=>title.trim().length<3)).map(([code])=>code);
      setFeedback({type:'error',text:invalid.length?
        'Update the older short check names in '+invalid.join(', ')+
        ' (minimum 3 characters) before saving this quotation.':
        error instanceof Error?error.message:'Review stage requirements before saving.'});
      return;
    }
    if (!valid) {
      setFeedback({
        type: 'error',
        text: 'Enter a name and a positive percentage for each stage. All percentages must add up to exactly 100%.',
      });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setFeedback({ type: 'error', text: 'The quotation total is invalid. Save the estimate first.' });
      return;
    }
    setFeedback(null);
    start(async () => {
      try {
        const response=await fetch('/dashboard/quotations/'+initial.revision_id+'/conditions',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({kind:'payments',stages:rows,stageRequirements:visibleRequirements}),
        });
        const result:unknown=await response.json().catch(()=>null);
        const data=result&&typeof result==='object'
          ?result as {id?:string;message?:string;reference?:string}:null;
        if(response.ok && data?.id){
          setFeedback({type:'success',text:data.message||
            'Payment schedule saved and included in the customer PDF.'});
          router.refresh();
        }else{
          setFeedback({type:'error',text:
            (data?.message||'Unable to save the payment schedule (HTTP '+response.status+').')+
            (data?.reference?' Reference '+data.reference:'')});
        }
      }catch{
        setFeedback({type:'error',text:'Network error saving payment schedule. Try again.'});
      }
    });
  }

  function combineBrickwork(index:number){
    const first=rows[index],next=rows[index+1];
    if(!first||!next||!first.name.toLowerCase().includes('brickwork')||
       !next.name.toLowerCase().includes('brickwork')||!first.stageCodes.length||
       !next.stageCodes.length)return;
    const joined=[...new Set([...first.stageCodes,...next.stageCodes])];
    if(joined.length>18)return;
    const before=first.name.replace(/ brickwork.*$/i,'');
    const after=next.name.replace(/ brickwork.*$/i,'');
    const name=(before+' + '+after+' brickwork & door frames payment').slice(0,100);
    const merged={name,percent:(Number(first.percent)+Number(next.percent)).toFixed(2),
      stageCodes:joined};
    remapMilestones([...rows.slice(0,index),merged,...rows.slice(index+2)],oldIndex=>
      oldIndex===index||oldIndex===index+1?index:oldIndex>index+1?oldIndex-1:oldIndex);
  }

  const remaining = Math.abs(100 - percentTotal) < 0.001 ? 0 : 100 - percentTotal;
  const remainingLabel = formatPercent(remaining);

  return (
    <section className="qs-payment-panel" aria-label="Quotation payment schedule">
      <div className="qs-payment-heading">
        <span className="qs-payment-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M7 15h4" />
          </svg>
        </span>
        <div>
          <h2>Payment Schedule</h2>
          <p>Define stage-wise payments from the quoted work and floors.</p>
          <p>Slabs and brickwork are floor-wise. Combine adjacent brickwork rows when agreed. Milestones appear in the PDF only after saving.</p>
        </div>
      </div>

      <div className={'qs-payment-status ' + (
        feedback?.type === 'error' ? 'qs-payment-status-error' :
        savedPlan && !hasChanges ? 'qs-payment-status-saved' : 'qs-payment-status-unsaved'
      )} role="status">
        <span className="qs-payment-status-mark" aria-hidden="true">{savedPlan && !hasChanges && feedback?.type !== 'error' ? '✓' : 'ⓘ'}</span>
        <span>{feedback?.type === 'error' ? feedback.text
          : savedPlan && !hasChanges ? 'Payment schedule saved in this quotation.'
          : savedPlan ? 'You have unsaved changes. Save to update the customer PDF.'
          : editable ? 'Not saved yet — these percentages are suggestions. Save to include them in the PDF.'
          : 'No payment schedule was saved with this quotation.'}</span>
      </div>

      {editable && (
        <div className="qs-payment-actions">
          <button type="button" className="qs-payment-reset" disabled={pending}
            onClick={resetMilestones}>
            <span aria-hidden="true">↺</span> Reset suggestions
          </button>
          <button type="button" className="qs-payment-add" disabled={pending || rows.length >= MAX_STAGES}
            onClick={addStage}>
            <span aria-hidden="true">＋</span> Add milestone
          </button>
        </div>
      )}

      {industry==='construction'&&!floorNames.length&&!savedPlan&&editable&&
        <p className="qs-payment-footnote">
          Save the floor-wise SFT quotation scope first to generate slab, brickwork and finishing payments for the actual floors.
          You can still add a fully custom schedule using Add milestone.
        </p>}
      <div className="qs-payment-stages">
        <div className="qs-payment-table-head" aria-hidden="true">
          <span>Stage / Milestone</span><span>%</span><span>Amount</span>
        </div>
        {rows.length ? (
          <ol className="qs-payment-list">
            {rows.map((row, index) => (
              <li className="qs-payment-row" key={index}
                draggable={editable && !pending}
                onDragStart={(event) => { dragging.current = index; event.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(event) => { if (editable) event.preventDefault(); }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging.current !== null) {
                    const from = dragging.current;
                    reorderMilestones(from,index);
                  }
                  dragging.current = null;
                }}
                onDragEnd={() => { dragging.current = null; }}>
                <button type="button" className="qs-payment-grip" disabled={!editable || pending || index === 0}
                  title="Move up one stage (or drag the row to reorder)"
                  aria-label={'Move milestone ' + (index + 1) + ' up'}
                  onClick={() => reorderMilestones(index,index-1)}>
                  <span aria-hidden="true">⠿</span>
                </button>
                <div className="qs-payment-stage-name">
                  <label className="qs-payment-mobile-label" htmlFor={'qs-pay-stage-' + index}>Stage / Milestone</label>
                  <input id={'qs-pay-stage-' + index} aria-label={'Milestone ' + (index + 1)}
                    value={row.name} maxLength={100} disabled={!editable}
                    placeholder="Enter milestone"
                    onChange={(event) => update(index, 'name', event.target.value)} />
                  {row.stageCodes.length>0&&<div className="qs-payment-linked">
                    Covers {row.stageCodes.length} quote-defined work stage{row.stageCodes.length===1?'':'s'}.
                    {editable&&row.name.toLowerCase().includes('brickwork')&&
                     rows[index+1]?.name.toLowerCase().includes('brickwork')&&
                     <button type="button" disabled={pending} onClick={()=>combineBrickwork(index)}>
                      Combine with next floor brickwork
                     </button>}
                  </div>}
                  {industry==='construction'&&row.stageCodes.length>0&&
                   <details className="qs-payment-stage-guidance">
                    <summary>Customize work, materials & checks <span aria-hidden="true">⌄</span></summary>
                    {[...new Set(row.stageCodes)].map(code=>
                     <StageRequirementsEditor key={code} code={code}
                      value={visibleRequirements[code]} editable={editable}
                      payments={rows.flatMap((payment,paymentIndex)=>
                       payment.stageCodes.includes(code)?[{index:paymentIndex,name:payment.name,percent:payment.percent}]:[])}
                      onChange={value=>editRequirements(code,value)}
                      relatedCount={stageCodes.filter(c=>c.split('/')[0]===code.split('/')[0]).length}
                      onApplyRelated={value=>applyRelated(code,value)}/>)}
                   </details>}
                </div>
                <div className="qs-payment-percent">
                  <label className="qs-payment-mobile-label" htmlFor={'qs-pay-pct-' + index}>Percentage</label>
                  <div className="qs-payment-percent-field">
                    <input id={'qs-pay-pct-' + index} aria-label={'Percent ' + (index + 1)}
                      type="number" inputMode="decimal" step="0.01" min="0.01" max="100"
                      value={row.percent} disabled={!editable}
                      onChange={(event) => update(index, 'percent', event.target.value)} />
                    <span aria-hidden="true">%</span>
                  </div>
                </div>
                <div className="qs-payment-amount">
                  <span className="qs-payment-mobile-label">Amount</span>
                  <output aria-label={'Estimated payment ' + (index + 1)}>{money(stageAmounts[index] ?? 0)}</output>
                </div>
                {editable && (
                  <button type="button" className="qs-payment-remove" disabled={pending}
                    title="Remove milestone" aria-label={'Remove milestone ' + (index + 1)}
                    onClick={() => removeMilestone(index)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : <p className="qs-payment-empty">No payment milestones were saved for this quotation.</p>}
      </div>

      <div className="qs-payment-summary">
        <div><span>Total Percentage</span><strong className={valid ? 'qs-payment-summary-highlight' : 'qs-payment-summary-warning'}>{formatPercent(percentTotal)}</strong></div>
        <div><span>Estimated Amount</span><strong>{money(amount)}</strong></div>
        <div><span>Balance</span><strong className={remaining === 0 ? 'qs-payment-summary-ok' : 'qs-payment-summary-warning'}>{remainingLabel}</strong><small>{remaining === 0 ? 'All stages covered' : remaining > 0 ? 'Still to allocate' : 'Over allocated'}</small></div>
      </div>

      {editable && (
        <button type="button" className="qs-payment-save" data-studio-save="payments"
          disabled={pending} onClick={save}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-8h10v8" />
          </svg>
          {pending ? 'Saving Payment Schedule…' : 'Save Payment Schedule'}
        </button>
      )}
      {feedback?.type === 'success' && (
        <p className="qs-payment-feedback" role="status">{feedback.text}</p>
      )}
      <p className="qs-payment-footnote">Payment milestones are proposals, not invoices or receipts.</p>
    </section>
  );
}
