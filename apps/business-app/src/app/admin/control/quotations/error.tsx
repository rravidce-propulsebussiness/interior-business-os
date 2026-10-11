'use client';
import { useEffect } from 'react';

export default function QuotationControlError({
 error, reset,
}: {error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{
  console.error('Quotation governance page render error',error);
 },[error]);
 return <main className="mx-auto max-w-3xl p-6">
  <div className="rounded-3xl border border-amber-200 bg-white p-7 shadow-sm">
   <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Quotation governance</p>
   <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Could not load quotation controls</h1>
   <p className="mt-2 text-sm leading-6 text-slate-600">
    No company quotations or invoices were changed. Try again. If it recurs,
    provide the server error digest from the application logs so the failing server request can be traced.
   </p>
   {error.digest&&<p className="mt-3 break-all font-mono text-xs text-slate-500">Reference: {error.digest}</p>}
   <button type="button" onClick={reset} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Retry</button>
  </div>
 </main>;
}
