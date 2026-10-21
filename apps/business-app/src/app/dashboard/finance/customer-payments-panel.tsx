import 'server-only';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { financeServices } from './service';
import { FinanceForm } from './form';
import { nextMilestoneDue, type MilestoneDue } from './payment-due';

const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const value=(row:Record<string,unknown>,key:string)=>
 typeof row[key]==='string'?row[key] as string:
 typeof row[key]==='number'?String(row[key]):'';
const cash=(amount:string)=>
 new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',
 maximumFractionDigits:2}).format(Number(amount)||0);
function todayInIndia(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return v('year')+'-'+v('month')+'-'+v('day');
}
function financeUrl(contractId:string){
 return '/dashboard/finance?tab=payments'+
  (contractId?'&contract_id='+encodeURIComponent(contractId):'');
}

/**
 * The ONLY owner-facing client-payment workspace. The project remains a
 * read-only mirror of verified Finance receipts; quotation percentages never
 * become actual payments. Uses the existing Finance command and ledger.
 */
export async function CustomerPaymentsPanel({
 contractId:rawId='',query='',page=1,
}:{contractId?:string;query?:string;page?:number}){
 const s=await financeServices('payment.view',true);
 const selected=idPattern.test(rawId)?rawId:'';
 const canRecord=s.allowed('payment.record');
 const owner=s.context.roles.some(role=>role.name.toLowerCase()==='owner');
 const canManageMethods=s.allowed('billing.manage');
 const canSeeContracts=s.allowed('contract.view');
 const canAllocate=s.allowed('payment.allocate');
 const canSeeInvoices=s.allowed('invoice.view');
 const safePage=Math.max(1,Math.min(10000,Math.floor(page)||1));
 let contracts:Record<string,unknown>[]=[];
 let payments:Record<string,unknown>[]=[];
 let total=0;
 let methods:Record<string,unknown>[]=[];
 let invoices:Record<string,unknown>[]=[];
 let loadError='';
 let due:MilestoneDue|null=null;
 try {
  const [contractResponse,paymentResponse,methodResponse]=await Promise.all([
   canSeeContracts?s.finance.search('contracts',{q:query.slice(0,100)},1):
    Promise.resolve({rows:[] as Record<string,unknown>[],total:0,page:1}),
   s.finance.search('payments',selected?{contract_id:selected}:{q:query.slice(0,100)},safePage),
   s.finance.search('payment_methods',{},1),
  ]);
  contracts=contractResponse.rows;
  payments=paymentResponse.rows;
  total=paymentResponse.total;
  methods=methodResponse.rows.filter(row=>row.active===true);
  if(selected&&canSeeContracts&&!contracts.some(c=>value(c,'id')===selected)){
   const exact=await s.finance.detail('contracts',selected);
   contracts=[exact,...contracts];
  }
  if(selected&&canSeeContracts) due=await nextMilestoneDue(s.client,s.org,selected);
  if(selected&&canSeeInvoices&&canAllocate){
   const invoiceResponse=await s.finance.search('invoices',
    {contract_id:selected,status:'issued'},1);
   invoices=invoiceResponse.rows.filter(row=>
    row.invoice_type==='tax_invoice' && Number(value(row,'balance'))>0);
  }
 }catch{
  loadError='Payment records could not be loaded. Please try again.';
 }
 const activeContract=selected&&contracts.some(c=>value(c,'id')===selected);
 const contractNumber=contracts.find(c=>value(c,'id')===selected);
 const received=payments.filter(row=>row.status==='recorded')
  .reduce((sum,row)=>sum+(Number(value(row,'amount'))||0),0);
 const url=financeUrl(selected);
 return <div className="fw-payment-workspace">
  <section className="fw-panel">
   <div className="fw-panel-head"><div>
    <h2>Customer payments & receipts</h2>
    <p>One Finance ledger for every project. The project shows these exact receipts without a second entry.</p>
   </div></div>
   <form action="/dashboard/finance" method="get" className="fw-payment-filter">
    <input type="hidden" name="tab" value="payments"/>
    <label>Contract
     <select name="contract_id" defaultValue={selected} aria-label="Choose contract">
      <option value="">All contracts</option>
      {contracts.map(row=><option key={value(row,'id')} value={value(row,'id')}>
       {value(row,'contract_number')||'Contract'}{value(row,'customer_name')?' · '+value(row,'customer_name'):''}
      </option>)}
     </select>
    </label>
    <button type="submit">View payments</button>
   </form>
   {loadError&&<p role="alert" className="fw-muted">{loadError}</p>}
   {!loadError&&<div className="fw-payment-summary">
    <span><small>{selected?'Received for this contract':'Received on this page'}</small>
     <strong>{cash(String(received))}</strong></span>
    <span><small>Recorded transactions</small><strong>{payments.filter(p=>p.status==='recorded').length}</strong></span>
   </div>}
  </section>
  <section className="fw-panel">
   <div className="fw-panel-head"><div>
    <h2>Receipt history</h2><p>Only actual recorded amounts count. Quotation milestones and proforma invoices are not receipts.</p>
   </div></div>
   {!loadError&&payments.length>0?<div className="fw-payment-history">
    {payments.map(row=><div className="fw-payment-history-row" key={value(row,'id')}>
     <div><strong>{value(row,'payment_number')||'Payment'}</strong>
      <small>{value(row,'payment_date')||'Date unavailable'} · {value(row,'status')}</small></div>
     <strong>{cash(value(row,'amount'))}</strong>
    </div>)}
   </div>:<p className="fw-muted">{loadError||'No customer payments recorded yet.'}</p>}
   {!loadError&&total>safePage*25&&<Link className="fw-payment-more" href={url+'&payment_page='+(safePage+1)}>Next payments →</Link>}
   {!loadError&&safePage>1&&<Link className="fw-payment-more" href={url+'&payment_page='+(safePage-1)}>← Previous payments</Link>}
  </section>
  {canRecord&&<section className="fw-panel">
   <div className="fw-panel-head"><div><h2>Record a received payment</h2>
    <p>Use this only after funds arrive. The existing Finance command creates the ledger record and any receipt; it never duplicates the project entry.</p>
   </div></div>
   {!selected?<p className="fw-muted">Choose the customer's contract above to record its payment.</p>:
    !activeContract?<p className="fw-muted">This contract is unavailable or you do not have access to it.</p>:
    <>
     <p className="fw-muted">Selected: <strong>{value(contractNumber??{},'contract_number')}</strong></p>
     {methods.length===0?<div className="fw-payment-setup">
      <p className="fw-muted">No active receipt method is configured. Add the first payment method here before recording a receipt.</p>
      {canManageMethods?<details className="fw-payment-inline"><summary>Set up payment method</summary>
       <FinanceForm title="Save payment method" successHref={url}
        initial={{action:'payment_method',input:{name:'',kind:'bank_transfer',active:true}}}
        fields={[{key:'name',label:'Method name',required:true},
         {key:'kind',label:'Type',options:[
          {value:'bank_transfer',label:'Bank transfer'},
          {value:'upi',label:'UPI'},{value:'cash',label:'Cash'},
          {value:'cheque',label:'Cheque'},
          {value:'card_offline',label:'Card (offline)'},
          {value:'other',label:'Other'}]},
         {key:'active',label:'Enabled',type:'checkbox'}]}/>
      </details>:<p className="fw-muted">Ask the company owner to enable a receipt method.</p>}
     </div>:
     <details className="fw-payment-inline" key={selected}>
      <summary>Record received amount</summary>
      <FinanceForm title="Save received payment" successHref={url}
       fullPaymentAmount={due?.amount??''} ownerCanEnablePartial={owner}
       initial={{action:'record_payment',contract_id:selected,input:{
        idempotency_key:randomUUID(),payment_date:todayInIndia(),amount:due?.amount??'',
        method_id:value(methods[0]??{},'id'),external_reference:'',notes:'',allocations:[]}}}
       fields={[
        {key:'payment_date',label:'Date received',type:'date',required:true},
        {key:'amount',label:'Amount actually received (₹)',required:true},
        {key:'method_id',label:'Received through',required:true,options:methods.map(method=>({
         value:value(method,'id'),label:value(method,'name')}))},
        {key:'external_reference',label:'Bank / UPI / cheque reference'},
        {key:'notes',label:'Payment notes',type:'textarea'},
       ]}
       {...(invoices.length?{
        itemFields:[
         {key:'invoice_id',label:'Allocate to issued tax invoice',required:true,
          options:invoices.map(invoice=>({
           value:value(invoice,'id'),
           label:(value(invoice,'invoice_number')||'Invoice')+' · '+cash(value(invoice,'balance'))+' remaining'}))},
         {key:'amount',label:'Allocated amount (₹)',required:true}],
        itemsKey:'allocations',itemDefaults:{invoice_id:value(invoices[0]??{},'id'),amount:'0',idempotency_key:randomUUID()},
       }: {})}/>
      {due&&<p className="fw-footnote">Current milestone: {due.label}. Full remaining milestone payment is selected by default. Only the company Owner can enable a smaller receipt.</p>}
      <p className="fw-footnote">Invoice allocations are optional. Advance proformas are requests, not tax invoices; do not allocate an advance to a proforma as if it were a paid tax invoice.</p>
     </details>}
    </>}
  </section>}
  {!canRecord&&<p className="fw-muted">You can view payments, but only an authorized Finance user may record receipts.</p>}
 </div>;
}
