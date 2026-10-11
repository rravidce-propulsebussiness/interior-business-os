'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConstructionPackage } from '@business-os/database/construction-packages';
import { saveConstructionPackage } from './package-actions';

const field='w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
function PackageEditor({item,close}:{item?:ConstructionPackage;close:()=>void}){
 const router=useRouter();
 const [state,action,pending]=useActionState(saveConstructionPackage,{message:''});
 useEffect(()=>{if(state.saved){router.refresh();close();}},[state.saved,router,close]);
 return <form action={action} className="mt-4 grid gap-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:grid-cols-2">
  {item&&<><input type="hidden" name="id" value={item.id}/><input type="hidden" name="version" value={item.version}/></>}
  <label className="grid gap-1 text-xs font-bold text-slate-700">Package name
   <input name="name" className={field} maxLength={120} minLength={2} required defaultValue={item?.name??''} placeholder="e.g. Premium Construction"/>
  </label>
  <label className="grid gap-1 text-xs font-bold text-slate-700">Package code
   <input name="code" className={field} required pattern="[A-Za-z][A-Za-z0-9-]{1,19}" defaultValue={item?.code??''} placeholder="e.g. PREMIUM"/>
  </label>
  <label className="grid gap-1 text-xs font-bold text-slate-700">Package rate per built-up sq ft (₹)
   <input name="ratePerSqft" type="number" min="0.01" max="999999.99" step=".01" required className={field} defaultValue={item?.ratePerSqft??''}/>
  </label>
  <label className="grid gap-1 text-xs font-bold text-slate-700">Status
   <select name="status" defaultValue={item?.status??'active'} className={field}>
    <option value="active">Available</option><option value="inactive">Inactive</option>
   </select>
  </label>
  <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">Package inclusions and exclusions
   <textarea name="description" maxLength={600} rows={3} defaultValue={item?.description??''} className={field} placeholder="Specify scope, labour, structural work, exclusions and GST handling"/>
  </label>
  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
   <button disabled={pending} type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{pending?'Saving…':'Save package'}</button>
   <button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">Cancel</button>
   {state.message&&<p role={state.saved?'status':'alert'} className="text-sm text-slate-700">{state.message}</p>}
  </div>
 </form>;
}
export function ConstructionPackagesManager({packages,canManage}:{packages:ConstructionPackage[];canManage:boolean}){
 const [editing,setEditing]=useState<string|null>(null);
 return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Option 1 · fixed package pricing</p>
    <h2 className="mt-2 text-xl font-extrabold text-slate-950">Packages per sq ft</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Set one total selling price per built-up sq ft. Material and brand dropdowns define what is included; their individual rates are not added again.</p>
   </div>
   {canManage&&<button type="button" onClick={()=>setEditing(editing==='new'?null:'new')} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white">+ Create package</button>}
  </div>
  {editing==='new'&&<PackageEditor close={()=>setEditing(null)}/>}
  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
   {packages.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{item.code}</span>
     <span className={'text-xs font-semibold '+(item.status==='active'?'text-emerald-700':'text-slate-400')}>{item.status}</span></div>
    <h3 className="mt-3 text-lg font-extrabold text-slate-950">{item.name}</h3>
    <p className="mt-2 text-xl font-black text-blue-700">₹{Number(item.ratePerSqft).toLocaleString('en-IN')}/sq ft</p>
    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.description||'Scope not yet described'}</p>
    {canManage&&<button type="button" onClick={()=>setEditing(editing===item.id?null:item.id)}
      className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold text-blue-700">Edit package</button>}
    {canManage&&editing===item.id&&<PackageEditor key={item.version} item={item} close={()=>setEditing(null)}/>}
   </article>)}
  </div>
  {packages.length===0&&<p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">No company packages yet. Create a rate and a scope to enable package quotations.</p>}
 </section>;
}
