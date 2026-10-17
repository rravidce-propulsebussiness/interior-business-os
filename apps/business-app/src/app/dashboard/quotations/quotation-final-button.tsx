'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markQuotationFinal } from './final-quotation-actions';

export function QuotationFinalButton({quotationId,number}:{
  quotationId:string;number:string;
}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  return <span className="qs-mark-final-control">
    <button type="button" disabled={busy} className="qs-mark-final"
      title={'Mark '+number+' as the final quotation for this customer'}
      onClick={async()=>{
        setBusy(true);setError('');
        try{
          const result=await markQuotationFinal(quotationId);
          if(result.ok)router.refresh();
          else setError(result.message);
        }catch{
          setError('Unable to mark Final. Try again.');
        }finally{setBusy(false);}
      }}>{busy?'Saving…':'☆ Mark as Final'}</button>
    {error&&<small role="alert" className="qs-mark-final-error">{error}</small>}
  </span>;
}
