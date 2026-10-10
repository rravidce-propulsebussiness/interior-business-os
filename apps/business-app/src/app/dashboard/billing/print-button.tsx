'use client';
export function PrintInvoiceButton(){
 return <button type="button" onClick={()=>window.print()}
 className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white print:hidden">
  Print / Save as PDF
 </button>;
}
