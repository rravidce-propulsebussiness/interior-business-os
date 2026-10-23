'use client';
import {useActionState,useState} from 'react';
import {saveConstructionPaymentDefaults} from './payment-default-actions';

export function ConstructionPaymentDefaults({initial,canEdit}:{
 initial:{name:string;percent:number}[];canEdit:boolean;
}) {
 const [rows,setRows]=useState(initial.map(x=>({...x})));
 const [state,action,pending]=useActionState(saveConstructionPaymentDefaults,{saved:false,message:''});
 const total=rows.reduce((sum,row)=>sum+(Number(row.percent)||0),0);
 const set=(index:number,key:'name'|'percent',value:string)=>{
  setRows(items=>items.map((row,i)=>i===index?{
   ...row,[key]:key==='name'?value:value===''?0:Number(value),
  }:row));
 };
 return <div className="us-payment-defaults">
  <p className="us-info">
   Save one reusable default payment schedule for new construction quotations.
   Edit individual percentages, stage names and work in each quotation.
   Changing the company template never changes accepted quotations or projects.
  </p>
  {rows.length===0&&<p className="us-info">No company payment template yet.
   New quotations will use the standard floor-wise construction schedule until you save a company template.</p>}
  <form action={action}>
   <input type="hidden" name="rows" value={JSON.stringify(rows.map(row=>({
    name:row.name.trim(),percent:Number(row.percent),
   })))}/>
   <ol className="us-payment-default-list">
    {rows.map((row,index)=><li key={index}>
     <span className="us-payment-default-index">{index+1}</span>
     <label>Milestone name<input aria-label={'Default milestone '+(index+1)}
      value={row.name} maxLength={100} required disabled={!canEdit}
      onChange={e=>set(index,'name',e.target.value)}/></label>
     <label>Percentage <span className="us-payment-default-percent">
      <input aria-label={'Default percentage '+(index+1)}
       type="number" inputMode="decimal" min="0.01" max="100" step="0.01"
       value={row.percent||''} required disabled={!canEdit}
       onChange={e=>set(index,'percent',e.target.value)}/> %</span></label>
     {canEdit&&<button type="button" aria-label={'Remove default milestone '+(index+1)}
      onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>Remove</button>}
    </li>)}
   </ol>
   {canEdit&&<button type="button" className="us-payment-add"
    onClick={()=>setRows([...rows,{name:'New construction milestone',percent:0}])}
    disabled={rows.length>=40}>+ Add payment stage</button>}
   <div className="us-payment-default-footer">
    <strong>Total: {total.toFixed(2)}%</strong>
    {canEdit&&<button type="submit" className="us-save"
      disabled={pending||Math.abs(total-100)>0.001||rows.length===0||
       rows.some(x=>!x.name.trim()||x.percent<=0)}>
      {pending?'Saving…':'Save company payment defaults'}
    </button>}
   </div>
   {state.message&&<p role="status" className={state.saved?'us-info':'us-payment-error'}>{state.message}</p>}
  </form>
 </div>;
}
