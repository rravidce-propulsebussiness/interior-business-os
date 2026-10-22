'use client';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { saveMaterialOrderPermission,saveMaterialDelivery } from './[id]/site/material-delivery-actions';

type Result={saved:boolean;message:string};
const initial:Result={saved:false,message:''};
export function MaterialOrderingAccess({projectId,users,grants}:{
 projectId:string;users:{id:string;label:string}[];
 grants:{userId:string;canOrder:boolean}[];
}){
 const router=useRouter();
 const [state,submit,pending]=useActionState(async(_p:Result,form:FormData)=>{
  const r=await saveMaterialOrderPermission(projectId,form);
  if(r.saved)router.refresh();
  return r;
 },initial);
 return <details className="pv2-material-order-access">
  <summary>Who can order materials?</summary>
  <p className="pv2-hint">The business owner can always order. Grant a specific site engineer or procurement employee permission for this project only. Approval stays a separate action.</p>
  <form action={submit} className="pv2-form">
   <label>Project team member
    <select required name="user_id" defaultValue="">
     <option value="" disabled>Select assigned employee</option>
     {users.map(x=><option value={x.id} key={x.id}>{x.label} {grants.some(g=>g.userId===x.id&&g.canOrder)?'· Can order':''}</option>)}
    </select></label>
   <label>Ordering access
    <select name="allowed" defaultValue="true">
     <option value="true">Allow outside material orders</option>
     <option value="false">Remove ordering permission</option>
    </select></label>
   <button className="pv2-button pv2-primary" type="submit" disabled={pending}>{pending?'Saving…':'Save permission'}</button>
   {state.message&&<p role="status" className={'pv2-form-feedback '+(state.saved?'good':'bad')}>{state.message}</p>}
  </form>
  <p className="pv2-hint">Marketplace orders additionally require company purchase permission; this setting never grants company-wide purchasing.</p>
 </details>;
}
function DeliveryCommandForm({projectId,material,action}:{
 projectId:string;
 material:{id:string;status:string;source:string;reference:string;date:string|null;window:string|null};
 action:'place_outside_order'|'update_eta'|'confirm_received';
}){
 const router=useRouter();
 const [result,submit,pending]=useActionState(async(_p:Result,form:FormData)=>{
  const r=await saveMaterialDelivery(projectId,form);
  if(r.saved)router.refresh();
  return r;
 },initial);
 const delivery=action!=='confirm_received';
 return <form className="pv2-form" action={submit}>
  <input type="hidden" name="material_id" value={material.id}/>
  <input type="hidden" name="action_type" value={action}/>
  {action==='place_outside_order'&&<label>Outside supplier / order reference
    <input name="reference" required minLength={3} maxLength={500}
     placeholder="Supplier name, confirmation number or outside PO"/></label>}
  {delivery&&<>
   <label>Expected delivery date
    <input name="delivery_date" type="date" required defaultValue={material.date??''}/></label>
   <label>Delivery time window
    <select name="delivery_window" defaultValue={material.window??'evening'}>
     <option value="morning">Morning</option>
     <option value="afternoon">Afternoon</option>
     <option value="evening">Evening</option>
     <option value="anytime">Any time</option>
    </select></label>
  </>}
  <button className="pv2-button pv2-primary" type="submit" disabled={pending}>
   {pending?'Saving…':action==='place_outside_order'?'Record outside order':action==='update_eta'?'Save delivery estimate':'Confirm materials received'}
  </button>
  {action==='confirm_received'&&<p className="pv2-hint">Confirm only after the materials have physically arrived at the site.</p>}
  {result.message&&<p role="status" className={'pv2-form-feedback '+(result.saved?'good':'bad')}>{result.message}</p>}
 </form>;
}
export function MaterialDeliveryActions({projectId,material,canOrder,canReceive}:{
 projectId:string;
 material:{id:string;status:string;source:string;reference:string;date:string|null;window:string|null};
 canOrder:boolean;canReceive:boolean;
}){
 const status=material.status;
 const isMarketplacePending=material.source==='marketplace'&&
  material.reference.startsWith('Marketplace request ')&&
  !material.reference.startsWith('Marketplace request rejected ');
 const canPlace=status==='approved'&&canOrder&&!isMarketplacePending;
 const canEta=status==='ordered'&&canOrder;
 const canConfirm=status==='ordered'&&canReceive;
 if(!canPlace&&!canEta&&!canConfirm)return null;
 return <details className="pv2-material-delivery-actions">
  <summary>{canPlace?'Record outside order':'Delivery schedule & arrival'}</summary>
  {canPlace&&<DeliveryCommandForm projectId={projectId} material={material} action="place_outside_order"/>}
  {canEta&&<DeliveryCommandForm projectId={projectId} material={material} action="update_eta"/>}
  {canConfirm&&<DeliveryCommandForm projectId={projectId} material={material} action="confirm_received"/>}
  <p className="pv2-hint">Order placed ≠ delivered. Clients see confirmed status and recorded estimates, not supplier pricing.</p>
 </details>;
}
