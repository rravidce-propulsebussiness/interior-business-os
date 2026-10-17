import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { salaryLedger } from './salary-service';
import { payEmployeeSalary, saveEmployeeSalary } from './salary-actions';

const money=(v:number)=>new Intl.NumberFormat('en-IN',{
 style:'currency',currency:'INR',maximumFractionDigits:0,
}).format(Number(v)||0);
const currentMonth=()=>new Date().toISOString().slice(0,7);
export async function SalaryPanel({
 organizationId,canRecord,canView,month,
}:{organizationId:string;canRecord:boolean;canView:boolean;month?:string | undefined}) {
 if(!canView)return <section className="fw-panel"><p>Salary access requires payment permissions.</p></section>;
 const selected=/^\d{4}-(0[1-9]|1[0-2])$/.test(month??'')?month!:currentMonth();
 const {client}=await pageServices();
 let rows: Awaited<ReturnType<ReturnType<typeof salaryLedger>['list']>> | null = null;
 let errorMessage: string | null = null;
 try { rows = await salaryLedger(client).list(organizationId,selected+'-01'); }
 catch (error) {
   const code = error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
   console.error('[Business OS] salary list failed', {code});
   errorMessage = code === 'FORBIDDEN'
     ? 'This company does not have permission to view employee salary records.'
     : 'Unable to load the salary ledger. Please refresh or contact the administrator.';
 }
 if (!rows) return <section className="fw-panel"><h2>Salaries</h2>
   <p role="alert">{errorMessage}</p></section>;
 const gross=rows.reduce((sum,r)=>sum+Number(r.gross),0);
 const paid=rows.filter(r=>r.status==='paid').reduce((s,r)=>s+Number(r.net),0);
 const pending=rows.filter(r=>r.status==='pending').reduce((s,r)=>s+Number(r.net),0);
 return <>
   <div className="fw-metrics">
     <article className="fw-metric"><div><span>Gross salaries</span><strong>{money(gross)}</strong><small>{selected}</small></div></article>
     <article className="fw-metric"><div><span>Paid</span><strong>{money(paid)}</strong><small>Confirmed salary payments</small></div></article>
     <article className="fw-metric"><div><span>Payment Pending</span><strong>{money(pending)}</strong><small>Awaiting payment</small></div></article>
     <article className="fw-metric"><div><span>Employees</span><strong>{rows.length}</strong><small>Entries this month</small></div></article>
   </div>
   <section className="fw-panel">
    <div className="fw-panel-head"><div><h2>Employee salaries</h2>
     <p>Company employee payroll only. Site labour is managed inside Projects.</p></div>
     <form action="/dashboard/finance" className="fw-period">
      <input type="hidden" name="tab" value="salaries"/>
      <input type="month" name="month" defaultValue={selected} aria-label="Salary month"/>
      <button type="submit">View</button>
     </form>
    </div>
    {canRecord&&<details className="fw-salary-form"><summary>＋ Add employee salary</summary>
      <ActionForm action={saveEmployeeSalary} label="Record salary as pending">
       <input type="hidden" name="salaryMonth" value={selected}/>
       <div className="fw-salary-fields">
        <label>Employee name<input name="employeeName" minLength={2} maxLength={160} required placeholder="Employee name"/></label>
        <label>Gross salary (₹)<input name="gross" type="number" min="0.01" step="0.01" required/></label>
        <label>Deductions (₹)<input name="deductions" type="number" defaultValue="0" min="0" step="0.01"/></label>
        <label>Notes<input name="notes" maxLength={800} placeholder="Optional notes"/></label>
       </div>
      </ActionForm>
     </details>}
    <div className="fw-order-list">{rows.map(row=><div className="fw-order" key={row.id}>
      <span><strong>{row.employeeName}</strong><small>Gross {money(Number(row.gross))} · Deductions {money(Number(row.deductions))}</small></span>
      <span><strong>{money(Number(row.net))}</strong>
       {row.status==='paid'?<small>Paid · {row.paymentMethod?.replaceAll('_',' ')}</small>:
        canRecord?<details className="fw-salary-paid"><summary>Mark paid</summary>
          <ActionForm action={payEmployeeSalary} label="Confirm salary paid">
            <input type="hidden" name="id" value={row.id}/>
            <label>Method<select name="method" defaultValue="bank_transfer">
              <option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option>
            </select></label>
            <label>Payment reference<input name="reference" maxLength={120} placeholder="Transaction reference"/></label>
          </ActionForm>
        </details>:<small>Pending</small>}
      </span>
    </div>)}</div>
    {!rows.length&&<p className="fw-muted">No salary entries for this month. Use Add employee salary after calculating payroll.</p>}
   </section>
 </>;
}
