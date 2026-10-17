import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createLabourDisbursementsRepository } from '@business-os/database/labour-disbursements';
import { ActionForm } from '@business-os/ui/action-form';
import { createLabourDisbursement, markLabourDisbursementPaid } from './actions';
import './labour-premium.css';

export const dynamic='force-dynamic';

function indiaMonth() {
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',
  }).formatToParts(new Date());
  const value=(key:string)=>parts.find(p=>p.type===key)?.value??'01';
  return value('year')+'-'+value('month');
}
function range(month:string) {
  const selected=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:indiaMonth();
  const [year,number]=selected.split('-').map(Number);
  return { month:selected, from:selected+'-01',
    to:new Date(Date.UTC(year!,number!,0)).toISOString().slice(0,10)};
}
const money=(value:number)=>new Intl.NumberFormat('en-IN',{
  style:'currency',currency:'INR',maximumFractionDigits:2,
}).format(value);
const date=(value:string)=>new Intl.DateTimeFormat('en-IN',{
  day:'2-digit',month:'short',year:'numeric',timeZone:'UTC',
}).format(new Date(value+'T00:00:00Z'));

export default async function LabourPayments({
  searchParams,
}:{
  searchParams:Promise<{month?:string;project?:string}>;
}) {
  const ctx=await activeOrganization();
  if(!ctx)return <main className="labour-page"><h1>Labour payments</h1>
    <p>Choose a company workspace first.</p><Link href="/dashboard">Dashboard</Link></main>;
  const {authorization,client}=await pageServices();
  await authorization.requirePermission(ctx.organizationId,'payment.view');
  const params=await searchParams;
  const {month,from,to}=range(params.month??'');
  const canRecord=ctx.grants.some(g=>g.scope.kind==='organization'&&g.permission==='payment.record');
  const [rows,projectsResult]=await Promise.all([
    createLabourDisbursementsRepository(client).list(ctx.organizationId,from,to),
    canRecord?client.from('projects').select('id,name').eq('organization_id',ctx.organizationId)
      .order('name',{ascending:true}).limit(250):Promise.resolve({data:[]}),
  ]);
  const projects=projectsResult.data??[];
  const projectId=params.project??'';
  const selectedProject=projects.find(p=>p.id===projectId);
  const displayedRows=projectId && (selectedProject || rows.some(row=>row.projectId===projectId))
    ? rows.filter(row=>row.projectId===projectId) : rows;
  const gross=displayedRows.reduce((sum,r)=>sum+Number(r.grossAmount),0);
  const paid=displayedRows.filter(r=>r.status==='paid')
    .reduce((sum,r)=>sum+Number(r.netAmount),0);
  const pending=displayedRows.filter(r=>r.status==='pending')
    .reduce((sum,r)=>sum+Number(r.netAmount),0);

  return <main className="labour-page" id="main-content">
    <div className="labour-heading">
      <div>
        <Link className="labour-back" href="/dashboard/billing">← Billing</Link>
        <p className="labour-eyebrow">SITE OPERATIONS / FINANCE</p>
        <h1>{selectedProject ? selectedProject.name + ' · Labour payments' : 'Labour payments'}</h1>
        <p>Record site wages and contractor disbursements separately from customer receipts and GST invoices.</p>
      </div>
      <form action="/dashboard/billing/labour" method="get" className="labour-month">
        {selectedProject && <input type="hidden" name="project" value={selectedProject.id}/>}
        <label htmlFor="work-month">Work month</label>
        <input id="work-month" name="month" type="month" defaultValue={month} required/>
        <button type="submit">View</button>
      </form>
    </div>

    <section className="labour-summary" aria-label="Labour payment summary">
      <div><span>Gross labour costs</span><strong>{money(gross)}</strong><small>{displayedRows.length} entries this month</small></div>
      <div><span>Paid net amounts</span><strong>{money(paid)}</strong><small>Confirmed disbursements</small></div>
      <div><span>Pending net amounts</span><strong>{money(pending)}</strong><small>Not marked as paid</small></div>
    </section>

    <div className="labour-actions">
      <div><h2>Work &amp; payment register</h2><p>Payments are recorded once; a pending entry becomes paid only after confirmation.</p></div>
      <a href={'/dashboard/billing/labour/export?'+new URLSearchParams({from,to}).toString()}
        className="labour-export">↓ Download labour CSV</a>
    </div>
    <div className="labour-accounting-note">
      <strong>GST filing note:</strong> This is an expense/payment register, not an input-GST-credit claim.
      Record eligible contractor tax invoices separately under Purchase bills, and reconcile
      TDS, wages, and GST with your accountant.
    </div>

    {canRecord&&<details className="labour-card labour-entry">
      <summary><span>＋ Add labour work entry</span><small>Save as pending</small></summary>
      <ActionForm action={createLabourDisbursement} label="Save pending labour entry">
        <div className="labour-form">
          <label>Worker / labour contractor <input name="payeeName" required minLength={2} maxLength={160} placeholder="Name or team" /></label>
          <label>Project (optional)<select name="projectId" defaultValue={selectedProject?.id??""}>
            <option value="">General company labour</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label className="labour-wide">Work completed <input name="workDescription" required minLength={2} maxLength={300} placeholder="e.g. Ground floor column shuttering" /></label>
          <label>From <input name="workFrom" type="date" required defaultValue={from}/></label>
          <label>To <input name="workTo" type="date" required defaultValue={to}/></label>
          <label>Gross amount (₹) <input name="grossAmount" type="number" required min="0.01" step="0.01" max="999999999999.99" placeholder="0.00"/></label>
          <label>Deductions (₹) <input name="deductions" type="number" min="0" step="0.01" defaultValue="0" max="999999999999.99"/></label>
          <label className="labour-wide">Internal note <textarea name="notes" maxLength={1000} rows={2} placeholder="Advance adjustment or attendance reference (optional)"/></label>
        </div>
      </ActionForm>
    </details>}

    <section className="labour-card">
      <div className="labour-table-wrap">
        <table><thead><tr><th>Payee / Work</th><th>Project</th><th>Work period</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status / Action</th></tr></thead>
          <tbody>{displayedRows.map(r=><tr key={r.id}>
            <td><strong>{r.payeeName}</strong><small>{r.workDescription}</small></td>
            <td>{r.projectName||'General'}</td>
            <td>{date(r.workFrom)} – {date(r.workTo)}</td>
            <td>{money(Number(r.grossAmount))}</td>
            <td>{money(Number(r.deductions))}</td>
            <td className="labour-amount">{money(Number(r.netAmount))}</td>
            <td><PaymentStatus id={r.id} status={r.status} method={r.paymentMethod}
               reference={r.paymentReference} canRecord={canRecord}/></td>
          </tr>)}</tbody></table>
      </div>
      <div className="labour-mobile-list">{displayedRows.map(r=><article className="labour-mobile-item" key={r.id}>
        <div><strong>{r.payeeName}</strong><span className={'labour-pill '+r.status}>{r.status}</span></div>
        <p>{r.workDescription}</p>
        <small>{r.projectName||'General'} · {date(r.workTo)}</small>
        <div className="labour-mobile-value"><span>Net payable</span><strong>{money(Number(r.netAmount))}</strong></div>
        <PaymentStatus id={r.id} status={r.status} method={r.paymentMethod}
          reference={r.paymentReference} canRecord={canRecord}/>
      </article>)}</div>
      {!displayedRows.length&&<div className="labour-empty">No labour entries found for {month}. Add a work entry or choose another month.</div>}
    </section>
    <p className="labour-footnote">CSV is an accountant's supporting workpaper, not a GST return, statutory payslip, or proof of bank transfer.</p>
  </main>;
}

function PaymentStatus({
  id,status,method,reference,canRecord,
}:{
  id:string;status:'pending'|'paid';method:string|null;reference:string;canRecord:boolean;
}){
  if(status==='paid')return <div className="labour-paid"><span className="labour-pill paid">Paid</span>
    <small>{method?.replaceAll('_',' ')}{reference?' · '+reference:''}</small></div>;
  if(!canRecord)return <span className="labour-pill pending">Pending</span>;
  return <details className="labour-settle"><summary>Mark paid</summary>
    <ActionForm action={markLabourDisbursementPaid} label="Confirm paid">
      <input type="hidden" name="id" value={id}/>
      <label>Method<select name="method" required defaultValue="upi">
        <option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option>
        <option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option>
      </select></label>
      <label>Payment reference <input name="reference" maxLength={120} placeholder="UTR / UPI transaction ID"/></label>
    </ActionForm>
  </details>;
}
