'use client';
import { useState } from 'react';
export function ShareInvoicePdf({url,number}:{
 url:string;number:string
}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const share=async()=>{
  setBusy(true);setError('');
  try{
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Invoice PDF is unavailable');
   const blob=await response.blob();
   if(!blob.type.includes('pdf'))throw Error('Unexpected document type');
   const file=new File([blob],number.replace(/[^a-z0-9-]/gi,'-')+'.pdf',
    {type:'application/pdf'});
   if(navigator.canShare?.({files:[file]})&&navigator.share){
    await navigator.share({title:'Invoice '+number,files:[file]});
   }else{
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);link.download=file.name;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(link.href),15000);
   }
  }catch(err){
   if(err instanceof Error&&err.name!=='AbortError')
    setError('Could not share PDF. Use Download PDF instead.');
  }finally{setBusy(false);}
 };
 return <span className="flex items-center gap-2 print:hidden">
  <button type="button" onClick={()=>void share()} disabled={busy}
   className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700">
   {busy?'Preparing PDF…':'Share PDF'}
  </button>
  {error&&<small role="alert">{error}</small>}
 </span>;
}
