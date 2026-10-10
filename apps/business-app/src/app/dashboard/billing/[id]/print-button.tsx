'use client';
export function PrintDocumentButton(){
  return <button type="button" onClick={()=>window.print()}
    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 print:hidden">
    Print / Save PDF
  </button>;
}
