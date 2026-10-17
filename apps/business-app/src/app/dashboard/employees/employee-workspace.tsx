/* eslint-disable @next/next/no-html-link-for-pages -- Hosted Next.js routes use full navigation to avoid interrupted RSC responses. */
'use client';

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OwnerIcon } from '../owner-shell';
import {
  recordEmployeeAttendance, recordEmployeeSalary, reviewEmployeeProof,
  saveEmployeeProfile, saveEmployeeProof,
} from './actions';
import type { EmployeeRecord,EmployeeAttendance,EmployeeDocument } from './service';
import './employees.css';

type Tab = 'overview'|'documents'|'payroll'|'attendance';
type Draft = {
 id:string;name:string;role:string;department:EmployeeRecord['department'];phone:string;
 email:string;address:string;city:string;workLocation:string;dateOfBirth:string;
 joiningDate:string;emergencyName:string;emergencyPhone:string;salaryType:EmployeeRecord['salaryType'];
 salary:string;status:EmployeeRecord['status'];
};
const blank = ():Draft=>({id:'',name:'',role:'',department:'Site Team',phone:'',email:'',
 address:'',city:'',workLocation:'',dateOfBirth:'',joiningDate:'',
 emergencyName:'',emergencyPhone:'',salaryType:'monthly',salary:'',status:'active'});
function fromPerson(p:EmployeeRecord):Draft {
 return {id:p.id,name:p.name,role:p.role,department:p.department,phone:p.phone,
  email:p.email,address:p.address,city:p.city,workLocation:p.workLocation,
  dateOfBirth:p.dateOfBirth??'',joiningDate:p.joiningDate??'',
  emergencyName:p.emergencyName,emergencyPhone:p.emergencyPhone,
  salaryType:p.salaryType,salary:p.salary==null?'':String(p.salary),status:p.status};
}
const money=(value:number)=>new Intl.NumberFormat('en-IN',{
 style:'currency',currency:'INR',maximumFractionDigits:0,
}).format(value);
const formatDate=(value:string|null)=>value ? new Intl.DateTimeFormat('en-IN',{
 day:'2-digit',month:'short',year:'numeric',timeZone:'UTC',
}).format(new Date(value+'T00:00:00Z')):'Not set';
const kindLabel=(kind:EmployeeDocument['kind'])=>({
 aadhaar:'Aadhaar card',pan:'PAN card',passport:'Passport',
 driving_licence:'Driving licence',other:'Other document',
})[kind];
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2)
 .map(x=>x[0]?.toUpperCase()).join('')||'?';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});

export function EmployeeWorkspace({
 employees,attendance,payrollMonth,canViewSalary,canRecordSalary,
}:{
 employees:EmployeeRecord[];attendance:EmployeeAttendance[];payrollMonth:string;
 canViewSalary:boolean;canRecordSalary:boolean;
}) {
 const router=useRouter();
 const detailRef=useRef<HTMLElement>(null);
 const [pending,startTransition]=useTransition();
 const [selectedId,setSelectedId]=useState(employees[0]?.id??'');
 const [tab,setTab]=useState<Tab>('overview');
 const [search,setSearch]=useState('');
 const [roleFilter,setRoleFilter]=useState('all');
 const [locationFilter,setLocationFilter]=useState('all');
 const [statusFilter,setStatusFilter]=useState('all');
 const [payrollFilter,setPayrollFilter]=useState('all');
 const [group,setGroup]=useState('all');
 const [page,setPage]=useState(1);
 const [editor,setEditor]=useState<Draft|null>(null);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [proofType,setProofType]=useState<EmployeeDocument['kind']>('aadhaar');
 const [attendanceDate,setAttendanceDate]=useState(today());
 const [attendanceStatus,setAttendanceStatus]=useState<EmployeeAttendance['status']>('present');
 const [attendanceNote,setAttendanceNote]=useState('');
 const [savingProof,setSavingProof]=useState(false);
 const person=employees.find(x=>x.id===selectedId)??employees[0]??null;
 const roles=useMemo(()=>[...new Set(employees.map(x=>x.role))].sort(),[employees]);
 const locations=useMemo(()=>[...new Set(employees.map(x=>x.city||x.workLocation).filter(Boolean))].sort(),[employees]);
 const stats=useMemo(()=>{
  const active=employees.filter(x=>x.status==='active');
  return {total:employees.length,site:active.filter(x=>x.department==='Site Team').length,
   kyc:active.filter(x=>!x.documents.length||x.documents.some(d=>d.verification!=='verified')).length,
   payroll:active.reduce((sum,x)=>sum+(x.salaryType==='monthly'?(Number(x.salary)||0):0),0)};
 },[employees]);
 const filtered=useMemo(()=>employees.filter(x=>{
  const text=[x.name,x.code,x.phone,x.role,x.city,x.workLocation].join(' ').toLowerCase();
  return (!search||text.includes(search.toLowerCase())) &&
   (roleFilter==='all'||x.role===roleFilter) &&
   (locationFilter==='all'||x.city===locationFilter||x.workLocation===locationFilter) &&
   (statusFilter==='all'||x.status===statusFilter) &&
   (payrollFilter==='all'||x.salaryType===payrollFilter) &&
   (group==='all'||group==='inactive'&&x.status==='inactive'||
    group==='site'&&x.department==='Site Team'&&x.status==='active'||
    group==='office'&&x.department!=='Site Team'&&x.status==='active');
 }),[employees,search,roleFilter,locationFilter,statusFilter,payrollFilter,group]);
 const size=12,totalPages=Math.max(1,Math.ceil(filtered.length/size));
 const visible=filtered.slice((Math.min(page,totalPages)-1)*size,Math.min(page,totalPages)*size);
 const choose=(id:string)=>{
  setSelectedId(id);setTab('overview');setNotice('');setError('');
  if(window.innerWidth<=1100) detailRef.current?.scrollIntoView({
    behavior:'smooth',block:'start',
  });
 };
 const flash=(message:string,ok=true)=>{
  if(ok){setNotice(message);setError('');}
  else {setError(message);setNotice('');}
 };
 const saveEditor=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!editor||pending)return;
  startTransition(async()=>{
   const fields:Record<string,unknown>={...editor};
   if(!canRecordSalary)delete fields.salary;
   else fields.salary=editor.salary;
   const result=await saveEmployeeProfile(fields);
   flash(result.message,result.ok);
   if(result.ok){setEditor(null);if(result.id)setSelectedId(result.id);router.refresh();}
  });
 };
 const uploadProof=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!person||savingProof)return;
  setSavingProof(true);
  const form=new FormData(e.currentTarget);
  try{
   const result=await saveEmployeeProof(form);
   flash(result.message,result.ok);
   if(result.ok){router.refresh();setTab('documents');}
  }catch{flash('Unable to upload the identity proof.',false);}
  finally{setSavingProof(false);}
 };
 const review=(id:string,status:'verified'|'rejected'|'pending')=>{
  startTransition(async()=>{const result=await reviewEmployeeProof(id,status);
   flash(result.message,result.ok);if(result.ok)router.refresh();});
 };
 const markAttendance=(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!person)return;
  startTransition(async()=>{
   const result=await recordEmployeeAttendance({
    employeeId:person.id,date:attendanceDate,status:attendanceStatus,notes:attendanceNote,
   });
   flash(result.message,result.ok);if(result.ok)router.refresh();
  });
 };
 const makeSalary=()=>{
  if(!person)return;
  startTransition(async()=>{
   const result=await recordEmployeeSalary({employeeId:person.id,month:payrollMonth});
   flash(result.message,result.ok);if(result.ok)router.refresh();
  });
 };
 const exportCsv=()=>{
  const cols=['Employee ID','Name','Role','Department','Phone','Email',
    'Address','City','Work location','Joining date','Salary','Salary type','Status','KYC'];
  const values=filtered.map(x=>[
   x.code,x.name,x.role,x.department,x.phone,x.email,x.address,x.city,
   x.workLocation,x.joiningDate??'',
   canViewSalary?String(x.salary??''):'',x.salaryType,x.status,
   !x.documents.length?'Missing':x.documents.every(d=>d.verification==='verified')?'Verified':'Pending',
  ]);
  const escape=(v:string)=>'"'+v.replaceAll('"','""')+'"';
  const blob=new Blob(['\uFEFF'+[cols,...values].map(row=>row.map(escape).join(',')).join('\r\n')],
   {type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='employees.csv';link.click();
  URL.revokeObjectURL(url);
 };
 const status=(employee:EmployeeRecord)=>{
  if(!employee.documents.length)return 'missing';
  return employee.documents.every(d=>d.verification==='verified')?'verified':'pending';
 };
 const employeeAttendance=attendance.filter(x=>x.employeeId===person?.id);
 const alert=(notice||error)&&<p className={'emp-feedback '+(error?'is-error':'')} role="status">{error||notice}</p>;
 const payrollUrl='/dashboard/finance?tab=salaries&month='+payrollMonth;
 return <main id="main-content" className="emp-workspace">
  <header className="emp-heading">
   <div className="emp-heading-title"><span className="emp-title-icon"><OwnerIcon name="team" size={25}/></span>
    <div><h1>Employees</h1><p>Manage staff, site teams, payroll and identity records.</p></div>
   </div>
   <div className="emp-heading-actions">
    <button className="emp-outline" type="button" onClick={exportCsv}><OwnerIcon name="reports" size={16}/> Export</button>
    <button className="emp-primary" type="button" onClick={()=>{setEditor(blank());flash('');}}>
     <OwnerIcon name="plus" size={17}/> Add Employee</button>
   </div>
  </header>
  <section className="emp-metrics" aria-label="Employee statistics">
   <article><span className="emp-metric-icon is-orange"><OwnerIcon name="team" size={27}/></span>
    <div><small>Total Employees</small><strong>{stats.total}</strong><p>All registered staff</p></div></article>
   <article><span className="emp-metric-icon is-green"><OwnerIcon name="projects" size={27}/></span>
    <div><small>Active on Site</small><strong>{stats.site}</strong><p>Current active site team</p></div></article>
   <article><span className="emp-metric-icon is-red"><OwnerIcon name="quotations" size={27}/></span>
    <div><small>Pending KYC</small><strong>{stats.kyc}</strong><p>Missing or unverified proofs</p></div></article>
   <article><span className="emp-metric-icon is-violet"><OwnerIcon name="billing" size={27}/></span>
    <div><small>Estimated Monthly Payroll</small>
     <strong>{canViewSalary?money(stats.payroll):'Restricted'}</strong>
     <p>Active monthly salaried staff</p></div></article>
  </section>
  {alert}
  <div className="emp-layout">
   <section className="emp-list-area" aria-label="Employee directory">
    <div className="emp-toolbar">
     <label className="emp-search"><OwnerIcon name="search" size={17}/>
      <input aria-label="Search employees" placeholder="Search employee by name, ID or phone..."
       value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
     <select aria-label="Filter role" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(1);}}>
      <option value="all">All Roles</option>{roles.map(v=><option key={v}>{v}</option>)}</select>
     <select aria-label="Filter location" value={locationFilter} onChange={e=>{setLocationFilter(e.target.value);setPage(1);}}>
      <option value="all">All Locations</option>{locations.map(v=><option key={v}>{v}</option>)}</select>
     <select aria-label="Filter status" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}>
      <option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
     <select aria-label="Filter payroll type" value={payrollFilter} onChange={e=>{setPayrollFilter(e.target.value);setPage(1);}}>
      <option value="all">All Payroll Types</option><option value="monthly">Monthly</option>
      <option value="daily">Daily</option><option value="hourly">Hourly</option></select>
     <button className="emp-reset" type="button" onClick={()=>{
      setSearch('');setRoleFilter('all');setLocationFilter('all');
      setStatusFilter('all');setPayrollFilter('all');setGroup('all');setPage(1);
     }}>Clear</button>
    </div>
    <div className="emp-table-card">
     <nav className="emp-tabs" aria-label="Employee groups">
      {([
       ['all','All Employees',employees.length],
       ['site','Site Team',employees.filter(x=>x.department==='Site Team'&&x.status==='active').length],
       ['office','Office Staff',employees.filter(x=>x.department!=='Site Team'&&x.status==='active').length],
       ['inactive','Inactive',employees.filter(x=>x.status==='inactive').length],
      ] as const).map(([id,label,count])=><button type="button" key={id}
       className={group===id?'active':''} onClick={()=>{setGroup(id);setPage(1);}}>
       {label} <span>{count}</span></button>)}
     </nav>
     <div className="emp-table-scroll">
      <table className="emp-table"><thead><tr>
       <th>ID</th><th>Employee</th><th>Role</th><th>Phone</th><th>Location / Address</th>
       <th>KYC Status</th><th>Salary</th><th>Status</th><th>Actions</th>
      </tr></thead><tbody>
       {visible.map((x,i)=><tr key={x.id} className={person?.id===x.id?'selected':''}
        onClick={()=>choose(x.id)}>
        <td className="emp-code">{x.code}</td>
        <td><span className="emp-person"><span className={'emp-avatar color-'+(i%5)}>{initials(x.name)}</span>
         <span><b>{x.name}</b><small>{x.department}</small></span></span></td>
        <td><span className="emp-role">{x.role}</span></td>
        <td>{x.phone||'—'}</td>
        <td><b className="emp-location">{x.workLocation||x.city||'Not set'}</b>
         <small className="emp-cell-secondary">{x.city&&x.workLocation?x.city:x.address||''}</small></td>
        <td><span className={'emp-chip kyc-'+status(x)}>{status(x)==='verified'?'✓ Verified':
          status(x)==='pending'?'◷ Pending':'Missing'}</span></td>
        <td><b className="emp-salary">{canViewSalary&&x.salary!=null?money(Number(x.salary)):'—'}</b>
         <small className="emp-cell-secondary">{canViewSalary?x.salaryType:''}</small></td>
        <td><span className={'emp-chip '+(x.status==='active'?'is-active':'is-inactive')}>{x.status}</span></td>
        <td><button type="button" className="emp-row-action"
         onClick={e=>{e.stopPropagation();choose(x.id);setEditor(fromPerson(x));}} aria-label={'Edit '+x.name}>⋯</button></td>
       </tr>)}
      </tbody></table>
     </div>
     <div className="emp-mobile-cards">{visible.map((x,i)=><button type="button"
      className={'emp-mobile-card '+(person?.id===x.id?'selected':'')} key={x.id} onClick={()=>choose(x.id)}>
      <span className={'emp-avatar color-'+(i%5)}>{initials(x.name)}</span>
      <span className="emp-mobile-data"><b>{x.name}</b><small>{x.code} · {x.role}</small>
       <small>{x.phone||'No phone'} · {x.workLocation||x.city||'No location'}</small>
       <span className="emp-mobile-tags"><span className={'emp-chip kyc-'+status(x)}>{status(x)}</span>
        <span className={'emp-chip '+(x.status==='active'?'is-active':'is-inactive')}>{x.status}</span></span></span>
      <span aria-hidden="true">›</span></button>)}</div>
     {!visible.length&&<div className="emp-empty"><OwnerIcon name="team" size={30}/>
      <h2>{employees.length?'No employees match these filters':'No employees yet'}</h2>
      <p>{employees.length?'Clear filters to see other employees.':'Add your first team member and keep their details together.'}</p>
      {!employees.length&&<button className="emp-primary" onClick={()=>setEditor(blank())}>+ Add Employee</button>}
     </div>}
     <footer className="emp-pagination"><small>Showing {filtered.length?
      (Math.min(page,totalPages)-1)*size+1:0}–{Math.min(page,totalPages)*size>filtered.length?filtered.length:Math.min(page,totalPages)*size}
      {' '}of {filtered.length} employees</small>
      <div><span>{size} per page</span><button disabled={page<=1}
       onClick={()=>setPage(x=>Math.max(1,x-1))} aria-label="Previous employees">‹</button>
       <strong>{Math.min(page,totalPages)}</strong><span>/ {totalPages}</span>
       <button disabled={page>=totalPages} onClick={()=>setPage(x=>Math.min(totalPages,x+1))}
       aria-label="Next employees">›</button></div></footer>
    </div>
   </section>
   <aside ref={detailRef} className="emp-detail" aria-label="Selected employee">
    {person?<>
     <div className="emp-detail-top"><span className="emp-avatar emp-avatar-large">{initials(person.name)}</span>
      <div className="emp-detail-intro"><div><h2>{person.name}</h2>
       <span className={'emp-chip '+(person.status==='active'?'is-active':'is-inactive')}>{person.status}</span></div>
       <p>{person.code} · {person.role}</p><small>Joined {formatDate(person.joiningDate)}</small></div>
     </div>
     <nav className="emp-detail-tabs" aria-label="Employee detail sections">
      {(['overview','documents','payroll','attendance'] as Tab[]).map(t=><button key={t}
       type="button" className={tab===t?'active':''} onClick={()=>setTab(t)}>
       {t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
     </nav>
     <div className="emp-detail-body">
      {tab==='overview'&&<>
       <section className="emp-detail-section">
        <header><h3>Personal Information</h3><button onClick={()=>setEditor(fromPerson(person))}>✎ Edit</button></header>
        <div className="emp-detail-line"><span>Phone</span><b>{person.phone||'Not set'}</b></div>
        <div className="emp-detail-line"><span>Email</span><b>{person.email||'Not set'}</b></div>
        <div className="emp-detail-line"><span>Address</span><b>{[person.address,person.city].filter(Boolean).join(', ')||'Not set'}</b></div>
        <div className="emp-detail-line"><span>Date of Birth</span><b>{formatDate(person.dateOfBirth)}</b></div>
        <div className="emp-detail-line"><span>Emergency Contact</span>
         <b>{[person.emergencyName,person.emergencyPhone].filter(Boolean).join(' · ')||'Not set'}</b></div>
       </section>
       <section className="emp-detail-section">
        <header><h3>Employment Details</h3><button onClick={()=>setEditor(fromPerson(person))}>✎ Edit</button></header>
        <div className="emp-detail-line"><span>Role</span><b>{person.role}</b></div>
        <div className="emp-detail-line"><span>Department</span><b>{person.department}</b></div>
        <div className="emp-detail-line"><span>Work Location</span><b>{person.workLocation||'Not assigned'}</b></div>
        <div className="emp-detail-line"><span>Joining Date</span><b>{formatDate(person.joiningDate)}</b></div>
        {canViewSalary&&<div className="emp-detail-line"><span>Salary</span>
         <b>{person.salary!=null?money(Number(person.salary))+' / '+person.salaryType:'Not configured'}</b></div>}
       </section>
       <section className="emp-detail-section"><header><h3>ID Proof &amp; KYC</h3>
        <span className={'emp-chip kyc-'+status(person)}>{status(person)}</span></header>
        <div className="emp-proof-pills">{person.documents.length?person.documents.map(d=>
         <button key={d.id} onClick={()=>setTab('documents')}>▤ {kindLabel(d.kind)} · {d.verification}</button>)
          :<p>No identity documents uploaded.</p>}</div>
       </section>
      </>}
      {tab==='documents'&&<section className="emp-detail-section">
       <header><h3>Identity documents</h3><span className="emp-chip kyc-pending">Private</span></header>
       <p className="emp-detail-help">Only authorized staff can download or verify employee ID proofs.</p>
       {person.documents.map(d=><article className="emp-document" key={d.id}>
        <div><strong>{kindLabel(d.kind)}</strong><small>{d.fileName}</small>
         <span className={'emp-chip kyc-'+d.verification}>{d.verification}</span></div>
        <a href={'/dashboard/employees/documents/'+encodeURIComponent(d.id)}>Download</a>
        <div className="emp-document-review">
         <button disabled={pending} onClick={()=>review(d.id,'verified')}>✓ Verify</button>
         <button disabled={pending} onClick={()=>review(d.id,'rejected')}>Reject</button>
        </div>
       </article>)}
       <form onSubmit={uploadProof} className="emp-proof-upload">
        <input type="hidden" name="employeeId" value={person.id}/>
        <label>Document type<select name="kind" value={proofType}
         onChange={e=>setProofType(e.target.value as EmployeeDocument['kind'])}>
         <option value="aadhaar">Aadhaar card</option><option value="pan">PAN card</option>
         <option value="passport">Passport</option><option value="driving_licence">Driving licence</option>
         <option value="other">Other document</option></select></label>
        <label>Upload proof (PDF or image, max 8MB)<input type="file" name="file"
         accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label>
        <button className="emp-primary" disabled={savingProof} type="submit">
         {savingProof?'Uploading…':'Upload document'}</button>
       </form>
      </section>}
      {tab==='payroll'&&<section className="emp-detail-section">
       <header><h3>Payroll details</h3></header>
       {canViewSalary?<><div className="emp-payroll-amount">
        <small>{person.salaryType} salary</small>
        <strong>{person.salary!=null?money(Number(person.salary)):'Not configured'}</strong>
        <p>Employee code {person.code} · Month {payrollMonth}</p></div>
        {canRecordSalary&&person.salaryType==='monthly'&&Number(person.salary)>0&&
         <button className="emp-primary emp-full" disabled={pending} onClick={makeSalary}>
          Record this month&apos;s salary</button>}
        <p className="emp-detail-help">Recording creates a pending salary ledger entry.
         Confirm payment only after transfer, through Finance.</p>
        <a className="emp-text-link" href={payrollUrl}>Open Finance salary ledger ↗</a>
       </>:<p className="emp-detail-help">Salary information requires Finance permission.</p>}
      </section>}
      {tab==='attendance'&&<section className="emp-detail-section">
       <header><h3>Attendance</h3>
        <input aria-label="Attendance month" type="month" value={payrollMonth}
         onChange={e=>router.push('/dashboard/employees?month='+encodeURIComponent(e.target.value))}/>
       </header>
       <p className="emp-detail-help">Showing {payrollMonth}. Save one status per employee and day.</p>
       <form onSubmit={markAttendance} className="emp-attendance-form">
        <label>Date<input type="date" required max={today()} value={attendanceDate}
         onChange={e=>setAttendanceDate(e.target.value)}/></label>
        <label>Status<select value={attendanceStatus}
         onChange={e=>setAttendanceStatus(e.target.value as EmployeeAttendance['status'])}>
         <option value="present">Present</option><option value="absent">Absent</option>
         <option value="half_day">Half day</option><option value="leave">Leave</option></select></label>
        <label>Note<textarea value={attendanceNote} maxLength={300}
         onChange={e=>setAttendanceNote(e.target.value)} placeholder="Optional note"/></label>
        <button className="emp-primary" disabled={pending}>Save attendance</button>
       </form>
       <div className="emp-attendance-history">{employeeAttendance.length?employeeAttendance.map(a=>
        <div key={a.date}><strong>{formatDate(a.date)}</strong>
         <span className="emp-chip">{a.status.replaceAll('_',' ')}</span><small>{a.notes}</small></div>)
        :<p>No attendance recorded for this month.</p>}</div>
      </section>}
     </div>
     <footer className="emp-detail-footer">
      <button type="button" className="emp-outline" onClick={()=>setTab('documents')}>▤ View Documents</button>
      {canViewSalary&&<button type="button" className="emp-outline" onClick={()=>setTab('payroll')}>Pay Salary</button>}
      <button type="button" className="emp-primary" onClick={()=>setEditor(fromPerson(person))}>✎ Edit Employee</button>
     </footer>
    </>:<div className="emp-detail-placeholder"><OwnerIcon name="team" size={35}/><h3>Select an employee</h3>
     <p>Staff details and ID proofs appear here.</p></div>}
   </aside>
  </div>
  {editor&&<div className="emp-modal-overlay" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setEditor(null);}}>
   <section role="dialog" aria-modal="true" aria-label={editor.id?'Edit employee':'Add employee'} className="emp-modal">
    <header><div><small>Employee directory</small><h2>{editor.id?'Edit Employee':'Add Employee'}</h2>
      <p>Keep personal, employment and pay details in one place.</p></div>
     <button aria-label="Close employee form" type="button" onClick={()=>setEditor(null)}>×</button></header>
    <form onSubmit={saveEditor}>
     <div className="emp-form-grid">
      {([
       ['name','Full name *','text'],['phone','Phone number','tel'],
       ['email','Email address','email'],['role','Role *','text'],
       ['address','Street address','text'],['city','City / locality','text'],
       ['workLocation','Work location / site','text'],
       ['emergencyName','Emergency contact name','text'],
       ['emergencyPhone','Emergency phone','tel'],
       ['dateOfBirth','Date of birth','date'],['joiningDate','Joining date','date'],
      ] as const).map(([key,label,type])=><label key={key}>{label}
       <input type={type} required={key==='name'||key==='role'} maxLength={key==='address'?500:160}
        value={editor[key]} onChange={e=>setEditor({...editor,[key]:e.target.value})}/></label>)}
      <label>Department<select value={editor.department} onChange={e=>setEditor({...editor,
       department:e.target.value as Draft['department']})}>
       <option>Site Team</option><option>Office Staff</option><option>Management</option><option>Other</option>
      </select></label>
      <label>Status<select value={editor.status} onChange={e=>setEditor({...editor,
       status:e.target.value as Draft['status']})}>
       <option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      {canRecordSalary&&<label>Salary amount (₹)<input type="number" min="0" max="9999999999" step=".01"
       value={editor.salary} onChange={e=>setEditor({...editor,salary:e.target.value})}/></label>}
      <label>Salary type<select value={editor.salaryType} onChange={e=>setEditor({...editor,
       salaryType:e.target.value as Draft['salaryType']})}>
       <option value="monthly">Monthly</option><option value="daily">Daily</option>
       <option value="hourly">Hourly</option></select></label>
     </div>
     <p className="emp-form-note">ID card proofs can be uploaded after saving in the Documents tab.
      Employee IDs are assigned automatically.</p>
     <footer><button type="button" className="emp-outline" onClick={()=>setEditor(null)}>Cancel</button>
      <button type="submit" className="emp-primary" disabled={pending}>{pending?'Saving…':'Save Employee'}</button></footer>
    </form>
   </section>
  </div>}
 </main>;
}
