import Link from 'next/link';
import Image from 'next/image';
import { OwnerIcon, type OwnerIconName, OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import { guidanceForConstructionStage } from '@business-os/core/construction-payment-schedule';
import { ProjectStageLinker,type StageLinkOption } from './project-stage-linker';
import { ProjectClientAccess } from './project-client-access';
import { ProjectSiteSurvey,ProjectAdvanceAction } from './project-next-forms';
import { MasterForm } from '../commercial/master-form';
import { activeOrganization } from '@business-os/auth/server';
import { projectWorkspace,formatMoney,pretty,shortDate,stringValue,
 type WorkspaceData,type SiteRow } from './project-v2-data';
import {
 SiteReportForm,SiteMediaForm,MaterialRequestForm,MaterialUpdateForm,
 QualityForm,ReviewCheck,ProjectDrawingForm,GateForm,AssignRole,SyncStages,
 ProjectLifecycle,PrepareAgreement,SignedAgreementUploadForm,
} from './project-v2-forms';
import '../owner-dashboard.css';
import './project-v2.css';

export const projectPages=[
 {slug:'overview',title:'Overview',icon:'dashboard' as OwnerIconName},
 {slug:'timeline',title:'Timeline',icon:'calendar' as OwnerIconName},
 {slug:'documents',title:'Quote & Agreement',icon:'quotations' as OwnerIconName},
 {slug:'payments',title:'Payments',icon:'billing' as OwnerIconName},
 {slug:'procurement',title:'Procurement',icon:'purchases' as OwnerIconName},
 {slug:'labour',title:'Labour',icon:'team' as OwnerIconName},
 {slug:'execution',title:'Execution',icon:'projects' as OwnerIconName},
 {slug:'checks',title:'Checks',icon:'check' as OwnerIconName},
 {slug:'designs',title:'Designs & Plans',icon:'quotations' as OwnerIconName},
 {slug:'team',title:'Team & Access',icon:'team' as OwnerIconName},
] as const;
export type ProjectPageSlug=(typeof projectPages)[number]['slug'];
const cur=(id:string,view:string)=>'/dashboard/projects/'+id+(view==='overview'?'':'/'+view);
function Status({value}:{value:string}) {
 return <span className={'pv2-status '+(['active','ongoing','paid','passed','approved','received','completed'].includes(value)
  ?'good':['pending','in_progress','requested','submitted','ordered'].includes(value)?'warn':'neutral')}>
  {pretty(value)||'Not recorded'}</span>;
}
function Title({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){
 return <header className="pv2-section-header"><div><h2>{title}</h2><p>{detail}</p></div>{action}</header>;
}
function Blank({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){
 return <div className="pv2-blank"><OwnerIcon name="projects" size={28}/>
  <h3>{title}</h3><p>{detail}</p>{action}</div>;
}
function DataTable({head,children}:{head:string[];children:React.ReactNode}){
 return <div className="pv2-table-scroll"><table className="pv2-table"><thead><tr>
  {head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function NextLink({href,label}:{href:string;label:string}){
 return <Link className="pv2-action-link" href={href}>{label} <OwnerIcon name="arrow" size={14}/></Link>;
}
function PhotoStrip({projectId,rows}:{projectId:string;rows:SiteRow[]}){
 const media=rows.filter(row=>stringValue(row.mime).startsWith('image/')).slice(0,4);
 if(!media.length)return null;
 return <div className="pv2-photo-strip">{media.map(m=><a key={m.id}
  href={'/dashboard/projects/'+projectId+'/site/media/'+m.id} target="_blank" rel="noopener noreferrer"
  aria-label={stringValue(m.caption)||'View photo'}>
  <Image unoptimized src={'/dashboard/projects/'+projectId+'/site/media/'+m.id}
   width={152} height={92} alt={stringValue(m.caption)||'Project site photo'}/></a>)}</div>;
}
function FieldDate({value}:{value:unknown}){return <time>{shortDate(value)}</time>;}
function LinkTabs({data,active}:{data:WorkspaceData;active:ProjectPageSlug}){
 return <nav className="pv2-project-tabs" aria-label="Project workspace pages">
  {projectPages.filter(p=>p.slug!=='payments'||data.permissions.payments).map(p=>
   <Link key={p.slug} href={cur(data.project.id,p.slug)}
    aria-current={active===p.slug?'page':undefined} className={active===p.slug?'selected':''}>
    <OwnerIcon name={p.icon} size={16}/>{p.slug==='documents'&&!data.permissions.quotation&&!data.permissions.finance?'Documents':p.title}</Link>)}
 </nav>;
}
function ProjectHeader({data,active}:{data:WorkspaceData;active:ProjectPageSlug}){
 const p=data.project;
 return <div className="pv2-project-header">
  <div className="pv2-project-identity">
   <div className="pv2-project-thumb"><OwnerIcon name="projects" size={27}/></div>
   <div><h1>{p.name}</h1><div className="pv2-project-meta">
    <span><OwnerIcon name="quotations" size={13}/>{p.code||'Project'}</span>
    <span><OwnerIcon name="projects" size={13}/>{p.industry}</span>
    <span><OwnerIcon name="globe" size={13}/>{p.address}</span>
   </div></div><Status value={p.status}/>
  </div>
  <div className="pv2-project-header-actions">
   {data.permissions.manage&&data.projectRaw&&<details className="pv2-header-drawer">
    <summary className="pv2-button pv2-outline">✎ Edit project</summary>
    <div className="pv2-header-drawer-body">
     <MasterForm entity="projects" title="Save project" initial={data.projectRaw}
      fields={[
       {key:'name',label:'Project name',required:true},
       {key:'site_address.line1',label:'Site address'},
       {key:'site_address.city',label:'City'},
       {key:'site_address.region',label:'State'},
       {key:'notes',label:'Internal notes',type:'textarea' as const},
      ]}/>
    </div>
   </details>}
   {p.customerId&&<details className="pv2-header-drawer">
    <summary className="pv2-button pv2-outline">Share with client</summary>
    <div className="pv2-header-drawer-body">
     <ProjectClientAccess projectId={p.id} customerId={p.customerId}/>
    </div>
   </details>}
  </div>
  <LinkTabs data={data} active={active}/>
 </div>;
}
function ProjectPriority({d}:{d:WorkspaceData}){
 const signed=d.agreement?.clearanceType==='signed_copy_recorded';
 const inspection=d.preflight?.inspectionDone===true;
 const measurement=d.preflight?.measurementsDone===true;
 const invoice=d.advance;
 const received=invoice?.received??0;
 const advanceDue=invoice?.invoiceId?Math.max(0,(invoice.invoiceTotal||0)-received):null;
 const paid=Boolean(invoice?.invoiceId && invoice.invoiceTotal>0 && advanceDue===0);
 const next=!signed?'Confirm signed agreement':
   !inspection?'Site inspection':
   !measurement?'Site measurements':'Floor plan preparation';
 const notes=!signed?'Upload the signed agreement and record signing evidence once.':
   !inspection?'Inspect access, boundaries, utilities, existing structures and site levels before design.':
   !measurement?'Record dimensions, plot levels, road reference and setbacks before floor planning.':
   'The pre-design survey is recorded. Prepare the floor plan and send it for review.';
 const guess=d.quotePaymentTriggers.find(x=>/advance|booking/i.test(x.name))?.percent??10;
 return <section className="pv2-priority-wrap" aria-label="Project next actions">
  <div className="pv2-priority-main">
   <div className="pv2-priority-eyebrow"><span className="pv2-next-pulse"/> NEXT ACTION <span className="pv2-next-stage">{signed?'Design preparation':'Agreement'}</span></div>
   <h2>{next}</h2><p className="pv2-priority-description">{notes}</p>
   <div className="pv2-checklist-inline">
    <span className={signed?'done':'waiting'}>{signed?'✓':'○'} Signed agreement</span>
    <span className={inspection?'done':'waiting'}>{inspection?'✓':'○'} Site inspection</span>
    <span className={measurement?'done':'waiting'}>{measurement?'✓':'○'} Measurements</span>
   </div>
   {!signed?<p className="pv2-next-notice">The agreement is not yet confirmed as signed. Uploading a PDF alone does not complete signing.</p>:
    !inspection&&d.permissions.manage?<details className="pv2-next-drawer" open>
      <summary>Record site inspection</summary>
      <ProjectSiteSurvey projectId={d.project.id} kind="inspection" previous={d.preflight?.inspectionDetails}/>
     </details>:
    inspection&&!measurement&&d.permissions.manage?<details className="pv2-next-drawer" open>
      <summary>Record site measurements</summary>
      <ProjectSiteSurvey projectId={d.project.id} kind="measurements" previous={d.preflight?.measurementDetails}/>
     </details>:
    inspection&&measurement&&d.site?.stage==='design'&&d.site.canManage?
     <details className="pv2-next-drawer" open><summary>Prepare floor plan</summary>
      <ProjectDrawingForm id={d.project.id} kind={/interior/i.test(d.project.industry)?'interior_layout':'architectural_plan'} label="Submit floor plan for review"/>
     </details>:null}
  </div>
  <aside className="pv2-priority-payment">
   <div className="pv2-next-payment-heading"><span className="pv2-priority-coin">₹</span>
    <div><strong>Advance payment</strong><small>{paid?'Verified receipt recorded':invoice?.invoiceId?'Payment requested':'Not yet requested'}</small></div></div>
   <strong className="pv2-priority-amount">{invoice?.invoiceId?formatMoney(invoice.invoiceTotal):'Not invoiced'}</strong>
   {invoice?.invoiceId?<div className="pv2-priority-payment-meta">
     <span>{invoice.invoiceNumber||'Advance proforma'}</span><Status value={paid?'paid':invoice.invoiceStatus||'pending'}/>
     <p>{formatMoney(received)} received · {formatMoney(advanceDue)} remaining</p>
    </div>:<p className="pv2-next-subtle">A signed agreement does not mean payment has arrived.</p>}
   {signed&&!invoice?.invoiceId&&d.permissions.finance&&d.permissions.manage&&
    <details className="pv2-next-drawer"><summary>Issue advance invoice</summary>
     <ProjectAdvanceAction projectId={d.project.id} defaultPercent={guess}/>
    </details>}
   {invoice?.invoiceId&&<a className="pv2-next-secondary" href={'/dashboard/finance/invoices/'+invoice.invoiceId}>
    View invoice <OwnerIcon name="arrow" size={13}/></a>}
   {!invoice?.scheduleActive&&signed&&<p className="pv2-next-subtle">
    Payment schedule still needs activation before physical construction.</p>}
  </aside>
 </section>;
}
function Overview({d}:{d:WorkspaceData}){
 const site=d.site;
 const progress=d.project.progress;
 const reports=site?.reports??[];
 const newest=reports[0],planned=d.tasks.find(t=>t.status!=='done'&&t.status!=='cancelled'&&t.planned_start);
 const photo=site?.media.find(r=>stringValue(r.mime).startsWith('image/'));
 const recorded=d.transactions?.filter(x=>x.status==='recorded')??[];
 const received=d.transactions===null?null:recorded.reduce((sum,r)=>sum+r.amount,0);
 const net=received===null||d.expenditure===null?null:received-d.expenditure;
 return <div className="pv2-content">
  <ProjectPriority d={d}/>
  <section className="pv2-stat-grid" aria-label="Project financial and progress summary">
   {[
    {name:'Client Payments Received',amount:formatMoney(received),detail:d.transactions===null?'Finance access required':'Verified recorded receipts',kind:'green',icon:'billing' as OwnerIconName},
    {name:'Site Expenditure',amount:formatMoney(d.expenditure),detail:'Full site expense ledger not available',kind:'orange',icon:'expenses' as OwnerIconName},
    {name:'Net Site Cash Position',amount:formatMoney(net),detail:'Receipts minus confirmed site spending',kind:'blue',icon:'billing' as OwnerIconName},
    {name:'Project Completion',amount:progress===null?'Not tracked':progress+'%',detail:'Weighted physical work tasks',kind:'purple',icon:'projects' as OwnerIconName}
   ].map(card=><article className="pv2-stat" key={card.name}><span className={'pv2-stat-icon '+card.kind}>
    <OwnerIcon name={card.icon} size={22}/></span><div><small>{card.name}</small>
    <strong>{card.amount}</strong><p>{card.detail}</p></div></article>)}
  </section>
  <div className="pv2-overview-split">
   <section className="pv2-panel pv2-current-stage">
    <Title title="Current Stage" detail="Approved quote-based execution milestones"
     action={<NextLink href={cur(d.project.id,'timeline')} label="Open Timeline"/>}/>
    {d.stages.length?(()=>{
     const stage=d.stages.find(s=>!['completed','certified','skipped'].includes(s.status))??d.stages[d.stages.length-1]!;
     return <div className="pv2-stage-preview">{photo&&<Image unoptimized width={205} height={155}
      src={'/dashboard/projects/'+d.project.id+'/site/media/'+photo.id} alt="Site progress"/>}
      <div><div className="pv2-between"><h3>{stage.title}</h3><Status value={stage.status}/></div>
       <p>{stage.explanation||'Work scope derived from approved quotation.'}</p>
       <ul>{stage.activities.slice(0,3).map((x,i)=><li key={i}>{x}</li>)}</ul>
       <NextLink href={cur(d.project.id,'execution')} label="Update Work"/></div></div>;
    })():<Blank title="Timeline not initialized"
      detail={d.agreement?'The signed-agreement construction stages have not been imported yet.':'This project has no linked agreement. Connect its approved floor-wise quotation and create the agreement before importing execution stages.'}
      action={site?.canManage
       ?d.agreement?<SyncStages id={d.project.id}/>:<NextLink href={cur(d.project.id,'documents')} label="Open quotations & agreement"/>
       :null}/>}
   </section>
   <section className="pv2-panel">
    <Title title="Today & Next Work" detail="Daily work and tomorrow's requirements"
     action={<NextLink href={cur(d.project.id,'timeline')} label="Open Timeline"/>}/>
    <div className="pv2-work-day"><span className="pv2-day-tag">Today</span>
     <strong>{stringValue(newest?.completed_work)||'No site work update yet'}</strong>
     <small>{newest?shortDate(newest.report_date):'No report submitted'}</small>
     <p>{newest?'Workers: '+stringValue(newest.worker_count)+' · Checks: '+(stringValue(newest.checks_required)||'Not noted'):'Record site activity to see today’s work.'}</p>
    </div>
    <div className="pv2-work-day"><span className="pv2-day-tag future">Tomorrow</span>
     <strong>{stringValue(newest?.tomorrow_plan)||planned?.title||'No planned work'}</strong>
     <small>{planned?shortDate(planned.planned_start):'Planning required'}</small>
     <p>{newest?'Workers required: '+(stringValue(newest.tomorrow_workers)||'Not set'):'Open Timeline to plan upcoming work.'}</p>
    </div>
   </section>
  </div>


 </div>;
}
type Activity={id:string;date:string;title:string;kind:string;description:string;media?:SiteRow};
function timeline(d:WorkspaceData):Activity[]{
 const site=d.site,all:Activity[]=[];
 for(const row of site?.reports??[])all.push({id:row.id,title:'Daily work update',kind:'execution',
  date:stringValue(row.report_date),description:stringValue(row.completed_work)});
 for(const row of site?.materials??[])all.push({id:row.id,title:'Material: '+stringValue(row.item),kind:'material',
  date:stringValue(row.created_at),description:stringValue(row.quantity)+' '+stringValue(row.unit)+' · '+pretty(row.status)});
 for(const row of site?.checks??[])all.push({id:row.id,title:'Quality check: '+stringValue(row.title),kind:'check',
  date:stringValue(row.created_at),description:pretty(row.status)});
 for(const row of site?.media??[])all.push({id:row.id,title:'Site file: '+stringValue(row.filename),
  kind:'media',date:stringValue(row.created_at),description:stringValue(row.caption),media:row});
 for(const row of site?.gate??[])all.push({id:row.id,title:pretty(row.kind),kind:'gate',date:stringValue(row.created_at),
  description:stringValue(row.description)});
 return all.sort((a,b)=>b.date.localeCompare(a.date));
}
function Timeline({d}:{d:WorkspaceData}){
 const all=timeline(d),site=d.site;
 const newReport=site?.reports[0];
 const associateOptions:StageLinkOption[]=[
  ...(site?.reports??[]).map(r=>({kind:'report' as const,id:r.id,title:shortDate(r.report_date)+' — '+stringValue(r.completed_work)})),
  ...(site?.materials??[]).map(r=>({kind:'material' as const,id:r.id,title:stringValue(r.item)})),
  ...(site?.checks??[]).map(r=>({kind:'check' as const,id:r.id,title:stringValue(r.title)})),
  ...(site?.media??[]).filter(r=>r.category!=='agreement').map(r=>({kind:'media' as const,id:r.id,title:stringValue(r.filename)})),
 ];
 return <div className="pv2-content pv2-timeline">
  {site&&<ProjectLifecycle id={d.project.id} stage={site.stage} canManage={site.canManage}
   agreementSigned={d.agreement?.clearanceType==='signed_copy_recorded'}
   industry={d.project.industry}
   designs={site.designs.map(x=>({id:x.id,kind:stringValue(x.kind),status:stringValue(x.status)}))}/>}
  {site?.stage==='design'&&d.quotations[0]&&d.agreement?.revisionId&&
   d.agreement.revisionId!==d.quotations[0].revisionId&&
   <section className="pv2-design-mismatch" role="alert">
    The recorded agreement references an earlier quotation. Floor plans can be prepared, but reconcile the agreement and chosen Final quotation before final design confirmation and construction.
    <NextLink href={cur(d.project.id,'documents')} label="Review agreement"/>
   </section>}
  <section className="pv2-panel">
   <Title title="Project Activity" detail="Latest drawing updates, daily progress, materials and quality checks"
    action={<span className="pv2-label">{all.length} recorded activities</span>}/>
   <div className="pv2-timeline-grid">
    <div className="pv2-timeline-main">
     {all.length?all.map(a=><article className="pv2-timeline-entry" key={a.kind+a.id}>
      <div className="pv2-time-column"><span>{shortDate(a.date)}</span><b className={'pv2-time-dot '+a.kind}/></div>
      <div className="pv2-timeline-details"><div className="pv2-between">
       <strong>{a.title}</strong><span className="pv2-label">{pretty(a.kind)}</span></div>
       <p>{a.description||'Project activity recorded'}</p>
       {a.kind==='execution'&&<PhotoStrip projectId={d.project.id} rows={site?.media??[]}/>}
       {a.media&&stringValue(a.media.mime).startsWith('image/')&&
        <PhotoStrip projectId={d.project.id} rows={[a.media]}/>}
      </div>
     </article>):<Blank title="No project events yet" detail="Site reports, inspection updates and material requests will appear here in date order."/>}
    </div>
    <aside className="pv2-stage-side pv2-stages-detail">
     <h3>Project Stages & Quality Checks</h3>
     <p className="pv2-muted">Start with architectural floor plans and structural design, then site preparation. Later, lower-floor brickwork may overlap upper-floor slabs after structural and safety clearances.</p>
     {d.stages.length?d.stages.map((st,i)=>{
      const guidance=guidanceForConstructionStage(st.template_code);
      const checks=[...new Set([...st.inspectionTopics,...guidance.checks])];
      const linkedPayments=d.quotePaymentTriggers.filter(p=>p.stageCodes.includes(st.instance_code));
      const attached=d.links.filter(r=>r.stage_id===st.id);
      return <details className="pv2-stage-detail" key={st.id}>
       <summary><span className="pv2-stage-index">{i+1}</span>
        <span className="pv2-stage-summary"><strong>{st.title}</strong>
         <small>{st.floor_code?st.floor_code.replaceAll('_',' '):'Project-wide'} · {pretty(st.status)}</small></span>
        <span className="pv2-stage-chevron" aria-hidden="true">⌄</span>
       </summary>
       <div className="pv2-stage-body">
        <p>{st.explanation}</p>
        {!!st.dependencies.length&&<p className="pv2-stage-dependencies">Prerequisite stages: {st.dependencies.join(' · ')}</p>}
        <h4>Work activities</h4>
        <ul>{st.activities.map((a,j)=><li key={j}>{a}</li>)}</ul>
        {!!guidance.materials.length&&<><h4>Materials to plan</h4><ul>
         {guidance.materials.map((m,j)=><li key={j}>{m}</li>)}</ul></>}
        {!!checks.length&&<><h4>Checks & tests to arrange</h4><ul>
         {checks.map((ch,j)=><li key={j}>{ch}</li>)}</ul></>}
        {!!guidance.reports.length&&<><h4>Reports & evidence to capture</h4><ul>
         {guidance.reports.map((r,j)=><li key={j}>{r}</li>)}</ul></>}
        {!!linkedPayments.length&&d.permissions.finance&&<div className="pv2-stage-payment">
         <strong>Quote payment association — not a payment request</strong>
         {linkedPayments.map((p,j)=><span key={j}>{p.name} · {p.percent}% of quotation</span>)}
        </div>}
        <div className="pv2-stage-evidence">
         <strong>{attached.length} explicitly linked site record{attached.length===1?'':'s'}</strong>
         <p>Links refer to original site records; they do not certify work, testing or payment.</p>
        </div>
        {site?.canManage&&<ProjectStageLinker projectId={d.project.id} stageId={st.id} options={associateOptions}/>}
        <div className="pv2-stage-links">
         <NextLink href={cur(d.project.id,'checks')} label="Record check"/>
         <NextLink href={cur(d.project.id,'procurement')} label="Request materials"/>
         <NextLink href={cur(d.project.id,'execution')} label="Add progress"/>
        </div>
       </div>
      </details>;
     }):<p className="pv2-muted">Stages are generated only from the approved quotation and agreement.</p>}
     {!d.stages.length&&site?.canManage&&
      (d.agreement?<SyncStages id={d.project.id}/>:
       <div className="pv2-stage-setup-notice">
        <p>A signed agreement linked to this project is required before the construction timeline can be imported. Quotation milestones are planning proposals, not verified site progress.</p>
        <NextLink href={cur(d.project.id,'documents')} label="Open quotations & agreement"/>
       </div>)}
    </aside>
   </div>
  </section>
  {site&&<section className="pv2-panel">
   <Title title="Today & Tomorrow" detail="One update goes into the shared execution and timeline history"/>
   <div className="pv2-two-col"><article className="pv2-snapshot"><span className="pv2-day-tag">Today</span>
    <strong>{stringValue(newReport?.completed_work)||'No work update'}</strong>
    <p>{newReport?stringValue(newReport.worker_count)+' workers on site':'Add the day’s work and site photos.'}</p>
   </article><article className="pv2-snapshot"><span className="pv2-day-tag future">Next work</span>
    <strong>{stringValue(newReport?.tomorrow_plan)||'No plan recorded'}</strong>
    <p>{newReport?stringValue(newReport.tomorrow_workers)+' workers planned':'Record tomorrow’s requirements.'}</p>
   </article></div>
   {site.stage==='execution'&&['manager','site_engineer'].includes(site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Add daily work update</summary><SiteReportForm id={d.project.id}/></details>}
   {site.stage==='execution'&&
    <details className="pv2-edit-drawer"><summary>＋ Upload site photos</summary>
     <SiteMediaForm id={d.project.id}/></details>}
  </section>}
 </div>;
}
function Documents({d}:{d:WorkspaceData}){
 const canSeeCommercial=d.permissions.quotation||d.permissions.finance;
 const photos=d.site?.media??[],agreement=photos.filter(r=>stringValue(r.category)==='agreement');
 const signedRecorded=d.agreement?.clearanceType==='signed_copy_recorded';
 const plans=photos.filter(r=>['plan','design'].includes(stringValue(r.category)));
 const other=photos.filter(r=>!['agreement','plan','design'].includes(stringValue(r.category)));
 const group=(title:string,list:SiteRow[])=> <section className="pv2-panel" key={title}>
  <Title title={title} detail={title==='Agreement'?'Signed project contract and supporting PDFs':title==='Plans & Drawings'?'Approved drawings and revisions':'Photographs and attached project documents'}/>
  {list.length?<div className="pv2-file-list">{list.map(row=><a key={row.id}
   href={'/dashboard/projects/'+d.project.id+'/site/media/'+row.id} className="pv2-file">
   <span className="pv2-file-icon"><OwnerIcon name="quotations" size={23}/></span>
   <span><strong>{stringValue(row.filename)}</strong><small>{shortDate(row.created_at)} · {stringValue(row.caption)||pretty(row.category)}</small></span>
   <b>View / Download</b></a>)}</div>:<Blank title="No files in this category" detail="Upload an authorized document to keep it on this project."/>}
 </section>;
 return <div className="pv2-content">
   {canSeeCommercial&&<>
    <ProjectPriority d={d}/>
    <section className="pv2-section-intro"><h2>Quotation & Agreement</h2>
     <p>Review and finalize the quotation, then prepare and upload the signed agreement. No separate online quotation approval is required.</p></section>
    <section className="pv2-panel pv2-quote-links">
     <Title title="Final Quotation" detail="Only the selected Final quotation is shown. Previous saved quotations remain in Quotations history."/>
     {d.quotations.length?<div className="pv2-file-list">{d.quotations.map(q=>
      <div className="pv2-commercial-row" key={q.id}>
       <div className="pv2-commercial-details"><strong>{q.number}</strong>
        <span><Status value={q.status==='draft'?'Saved':q.status}/><small>{shortDate(q.createdAt)}</small></span></div>
       <div className="pv2-commercial-actions">
        <NextLink href={'/dashboard/quotations/'+q.revisionId+'/preview'} label="Preview PDF"/>
        <NextLink href={'/dashboard/quotations/'+q.revisionId+'/studio?step=quote'} label={q.status==='draft'?'Edit saved quote':'Quote & payment plan'}/>
        {!d.agreement&&q.status==='issued'&&d.permissions.manage&&d.permissions.finance&&
         <PrepareAgreement projectId={d.project.id} revisionId={q.revisionId}/>}
       </div>
       {q.status==='draft'&&<p className="pv2-muted">Saved and editable. Sharing/finalizing this quotation locks the agreed version before preparing an agreement; no separate client approval is needed.</p>}
      </div>)}</div>:
      <Blank title="No saved final quotation found"
       detail="No active quotation was found for this project or its converted Won lead."
       action={d.permissions.quotation?<NextLink href="/dashboard/quotations" label="Open Quotations"/>:undefined}/>}
     {d.permissions.quotation&&<NextLink href="/dashboard/quotations" label="View earlier quotations / change Final"/>}
    </section>
    <section className="pv2-panel pv2-agreement-status">
     <Title title="Agreement" detail="One step to upload or select a signed PDF and save its evidence"/>
     {d.agreement?<div>
      <div className="pv2-between"><strong>{d.agreement.contractNumber}</strong>
       <Status value={signedRecorded?'signed':d.agreement.authorized?'approved':d.agreement.status||'pending'}/></div>
      {d.quotations[0]&&d.agreement.revisionId&&d.quotations[0].revisionId!==d.agreement.revisionId?
       <p role="alert" className="pv2-form-feedback bad">This agreement was prepared from an earlier quotation, not the currently selected Final quotation. Review the agreement scope before signing or starting work.</p>:
       <p className="pv2-muted">The agreement is tied to its saved quotation version. Payment schedule, signed evidence and advance remain required for execution.</p>}
      <NextLink href={'/dashboard/finance/contracts/'+d.agreement.contractId} label="Open agreement & schedule"/>
      {signedRecorded&&<p className="pv2-form-feedback good">Signed agreement recorded. No second upload or confirmation is needed.</p>}
      {agreement.length>0&&<div className="pv2-file-list" aria-label="Agreement PDFs">{agreement.map(row=>
       <a key={row.id} className="pv2-file"
        href={'/dashboard/projects/'+d.project.id+'/site/media/'+row.id}>
        <span className="pv2-file-icon"><OwnerIcon name="quotations" size={23}/></span>
        <span><strong>{stringValue(row.filename)}</strong><small>{shortDate(row.created_at)}</small></span>
        <b>View / Download</b>
       </a>)}</div>}
      {d.site?.canManage&&d.permissions.finance&&
       <details className="pv2-edit-drawer">
        <summary>{signedRecorded?'Replace signed agreement':'＋ Save signed agreement'}</summary>
        <SignedAgreementUploadForm projectId={d.project.id} contractId={d.agreement.contractId}
         recorded={signedRecorded}
         media={agreement.filter(x=>x.mime==='application/pdf').map(x=>({id:x.id,name:stringValue(x.filename)}))}/>
       </details>}
     </div>:<p className="pv2-muted">Prepare an agreement from the issued final quotation before uploading or recording a signed copy.</p>}
    </section>
   </>}
   <div className="pv2-section-intro"><h2>Project Documents</h2><p>Approved drawings, site photos and supporting records.</p></div>
   {!canSeeCommercial&&group('Agreement',agreement)}{group('Plans & Drawings',plans)}{group('Site Photos & Documents',other)}
  {d.site&&<section className="pv2-panel"><Title title="Upload Site Document" detail="Attach approved plans or other permitted project files"/>
   <SiteMediaForm id={d.project.id} category="design"/></section>}
 </div>;
}
function Payments({d}:{d:WorkspaceData}){
 if(!d.permissions.payments)return <Blank title="Finance permission required" detail="Only authorized finance users can view client receipts."/>;
 const paymentRows=d.transactions;
 const total=paymentRows?.filter(x=>x.status==='recorded').reduce((sum,x)=>sum+x.amount,0)??null;
 return <div className="pv2-content">
  <ProjectPriority d={d}/>
  <section className="pv2-stat-grid pv2-finance-metrics">
   <article className="pv2-stat"><small>Contract Value</small><strong>{formatMoney(d.contractValue)}</strong></article>
   <article className="pv2-stat"><small>Received</small><strong>{formatMoney(total)}</strong></article>
   <article className="pv2-stat"><small>Pending</small><strong>{formatMoney(d.contractValue!==null&&total!==null?Math.max(0,d.contractValue-total):null)}</strong></article>
  </section>
  <section className="pv2-panel"><Title title="Payment Schedule" detail="Milestones from active contract schedules. Requests are not receipts."
   action={<NextLink href={'/dashboard/finance/contracts?project_id='+d.project.id} label="Finance workspace"/>}/>
   {d.milestones.length?<DataTable head={['Milestone','Amount','Contract','Actions']}>
    {d.milestones.map(m=><tr key={m.id}><td><strong>{m.label}</strong></td>
     <td>{m.currency} {m.amount}</td><td>{m.contract_number}</td>
     <td><NextLink href={'/dashboard/finance/contracts?project_id='+d.project.id} label="View / Request"/></td></tr>)}</DataTable>:
    <Blank title="No payment milestones" detail="Payment schedules are managed in Finance from the signed contract."/>}
  </section>
  {!!d.quotePaymentTriggers.length&&<section className="pv2-panel">
    <Title title="Quoted Work-Linked Payments" detail="Quoted payment proposal; actual contract requests and receipts remain in Finance."/>
    <DataTable head={['Quoted milestone','Percentage','Associated work','Status']}>
      {d.quotePaymentTriggers.map((p,i)=><tr key={i}><td><strong>{p.name}</strong></td>
       <td>{p.percent}%</td><td>{p.stageCodes.length
        ?p.stageCodes.map(key=>d.stages.find(stage=>stage.instance_code===key)?.title??key).join(' · ')
        :'Custom milestone'}</td><td><span className="pv2-label">Not a receipt</span></td></tr>)}
    </DataTable>
  </section>}
  <section className="pv2-panel"><Title title="Client Payment Transactions" detail="All recorded and voided payments stay in their canonical finance ledger"/>
   {paymentRows?.length?<DataTable head={['Receipt / Payment','Date','Amount','Status']}>
    {paymentRows.map(r=><tr key={r.id}><td><strong>{r.number}</strong></td><td><FieldDate value={r.date}/></td>
     <td>{formatMoney(r.amount)}</td><td><Status value={r.status}/></td></tr>)}</DataTable>:
    <Blank title="No payments recorded" detail="Record and allocate payments through the existing Finance module."/>}
  </section>
 </div>;
}
function Procurement({d}:{d:WorkspaceData}){
 const site=d.site,materials=site?.materials??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Procurement & Materials" detail="Requests, purchase orders and delivery statuses share one canonical register"
    action={<NextLink href="/dashboard/marketplace/orders" label="Purchase Orders"/>}/>
   <nav className="pv2-local-tabs"><span className="active">Requests ({materials.length})</span>
    <span>Purchase Orders ({d.purchaseOrders?.length??'—'})</span></nav>
   {materials.length?<div className="pv2-material-list">{materials.map(m=><article className="pv2-material" key={m.id}>
    <span className="pv2-material-icon"><OwnerIcon name="purchases" size={23}/></span>
    <div><strong>{stringValue(m.item)}</strong>
     <small>{stringValue(m.quantity)} {stringValue(m.unit)} · {shortDate(m.created_at)}</small>
     {Boolean(m.vendor_reference)&&<small>Supplier / order: {stringValue(m.vendor_reference)}</small>}</div>
    <Status value={stringValue(m.status)}/>
    {site?.stage==='execution'&&site.role&&['manager','procurement'].includes(site.role)&&
     <MaterialUpdateForm id={d.project.id} material={{id:m.id,status:stringValue(m.status)}}/>}
   </article>)}</div>:
    <Blank title="No material requests" detail="Site engineers and procurement staff can add requests throughout the project."/>}
   {site?.stage==='execution'&&['manager','procurement','site_engineer'].includes(site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Request Material</summary><MaterialRequestForm id={d.project.id}/></details>}
  </section>
  <section className="pv2-panel">
   <Title title="Purchase Orders" detail="Orders come from the existing procurement engine, never from a duplicate form."/>
   {d.purchaseOrders?.length?<DataTable head={['PO Number','Order Date','Status','Action']}>
    {d.purchaseOrders.map(po=><tr key={po.id}><td>{po.number}</td>
     <td><FieldDate value={po.date}/></td><td><Status value={po.status}/></td>
     <td><NextLink href="/dashboard/marketplace/orders" label="View"/></td></tr>)}</DataTable>:
    <Blank title="No purchase orders available" detail="Review requests, supplier decisions and actual orders in Procurement."/>}
  </section>
 </div>;
}
function Labour({d}:{d:WorkspaceData}){
 const reports=d.site?.reports??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Labour & Site Attendance" detail="Daily workforce counts and field gate entries"
    action={<NextLink href={'/dashboard/billing/labour?project='+d.project.id} label="Labour payments"/>}/>
   {reports.length?<DataTable head={['Work date','On site','Required tomorrow','Work']}>
    {reports.map(r=><tr key={r.id}><td><FieldDate value={r.report_date}/></td>
     <td>{stringValue(r.worker_count)||'—'}</td><td>{stringValue(r.tomorrow_workers)||'—'}</td>
     <td>{stringValue(r.completed_work)}</td></tr>)}</DataTable>:
    <Blank title="No workforce reports yet" detail="Engineer work updates also record the number of labourers on site."/>}
  </section>
  <section className="pv2-panel">
   <Title title="Curing, Security & Gate Register" detail="Repeated labour, material delivery and site-security observations"/>
   {d.site?.gate.length?<div className="pv2-history">{d.site.gate.map(r=><div className="pv2-history-row" key={r.id}>
    <span><strong>{pretty(r.kind)}</strong><small>{shortDate(r.created_at)}</small></span>
    <p>{stringValue(r.description)}</p></div>)}</div>:<Blank title="No entries" detail="Watchman and manager can record site rounds and material arrivals."/>}
   {d.site?.stage==='execution'&&['manager','watchman'].includes(d.site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Add gate / curing entry</summary><GateForm id={d.project.id}/></details>}
  </section>
 </div>;
}
function Execution({d}:{d:WorkspaceData}){
 const rows=d.site?.reports??[];
 return <div className="pv2-content">
  <section className="pv2-panel">
   <Title title="Execution Updates" detail="Photos, reports, labour counts and progress are recorded repeatedly"
    action={<span className="pv2-label">{rows.length} recorded updates</span>}/>
   {rows.length?<div className="pv2-execution-list">{rows.map(row=><article className="pv2-execution" key={row.id}>
    <div><strong>{stringValue(row.completed_work)}</strong><Status value="recorded"/></div>
    <small>{shortDate(row.report_date)} · {stringValue(row.worker_count)} workers</small>
    <p>Tomorrow: {stringValue(row.tomorrow_plan)}</p>
    {Boolean(row.blockers)&&<small>Blockers: {stringValue(row.blockers)}</small>}
   </article>)}</div>:<Blank title="No daily execution reports" detail="When work starts, site engineers can record daily updates here."/>}
   <PhotoStrip projectId={d.project.id} rows={d.site?.media??[]}/>
   {d.site?.stage==='execution'&&['manager','site_engineer'].includes(d.site.role)&&
    <details className="pv2-edit-drawer"><summary>＋ Add Work Update</summary><SiteReportForm id={d.project.id}/></details>}
   {d.site?.stage==='execution'&&
    <details className="pv2-edit-drawer"><summary>＋ Upload Work Photos</summary><SiteMediaForm id={d.project.id}/></details>}
  </section>
 </div>;
}
function Checks({d}:{d:WorkspaceData}){
 const checks=d.site?.checks??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Checks & Quality" detail="Repeated structural checks, passes, failed checks and re-inspections"/>
  {checks.length?<DataTable head={['Inspection','Date','Status','Action']}>
   {checks.map(c=><tr key={c.id}><td><strong>{stringValue(c.title)}</strong>
    <small>{stringValue(c.notes)}</small></td><td><FieldDate value={c.due_date||c.created_at}/></td>
    <td><Status value={stringValue(c.status)}/></td><td>
     {d.site?.stage==='execution'&&['manager','quality_inspector','site_engineer'].includes(d.site.role)&&
      stringValue(c.status)!=='passed'&&<ReviewCheck id={d.project.id} checkId={c.id}/>}
    </td></tr>)}</DataTable>:<Blank title="No checks yet" detail="Record inspections and follow up until each check passes."/>}
  {d.site?.stage==='execution'&&['manager','quality_inspector','site_engineer'].includes(d.site.role)&&
   <details className="pv2-edit-drawer"><summary>＋ Add Check</summary><QualityForm id={d.project.id}/></details>}
 </section></div>;
}
function Designs({d}:{d:WorkspaceData}){
 const rows=d.site?.designs??[],designFiles=d.site?.media.filter(x=>['design','plan'].includes(stringValue(x.category)))??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Designs & Plans" detail="Floor plans, structural drawings, revision numbers and design approvals"/>
  {rows.length?<DataTable head={['Design','Revision','Reference','Status']}>
   {rows.map(x=><tr key={x.id}><td><strong>{pretty(x.kind)}</strong></td>
    <td>Rev {stringValue(x.revision)}</td><td>{stringValue(x.reference)}</td>
    <td><Status value={stringValue(x.status)}/></td></tr>)}</DataTable>:
   <Blank title="No design revisions" detail="Architects and structural designers can submit revisioned plans during the design stage."/>}
  {designFiles.length>0&&<div className="pv2-file-list">{designFiles.map(f=><a key={f.id}
   href={'/dashboard/projects/'+d.project.id+'/site/media/'+f.id} className="pv2-file">
   <OwnerIcon name="quotations" size={20}/><strong>{stringValue(f.filename)}</strong><span>Download</span></a>)}</div>}
  {d.site?.stage==='design'&&
   <details className="pv2-edit-drawer">
    <summary>＋ Upload drawing and submit revision</summary>
    <ProjectDrawingForm id={d.project.id} label="Save drawing revision"/>
   </details>}
 </section></div>;
}
function Team({d}:{d:WorkspaceData}){
 const people=d.site?.team??[],users=d.site?.memberOptions??[];
 return <div className="pv2-content"><section className="pv2-panel">
  <Title title="Team & Access" detail="Project-specific staff and client access; no duplicate company employee records"
   action={<NextLink href="/dashboard/company/team" label="Company Team"/>}/>
  {people.length?<div className="pv2-team-list">{people.map(row=><div className="pv2-person" key={row.id}>
   <span className="pv2-person-avatar">{pretty(row.role).slice(0,1)||'T'}</span>
   <div><strong>{users.find(x=>x.id===row.user_id)?.label||'Assigned project member'}</strong>
    <small>{pretty(row.role)}</small></div><Status value={row.active===true?'active':'inactive'}/>
  </div>)}</div>:<Blank title="No project assignments" detail="Invite existing company staff to this project without copying employee profiles."/>}
  {d.site?.canManage&&users.length>0&&<details className="pv2-edit-drawer">
   <summary>＋ Add Project Team Member</summary><AssignRole projectId={d.project.id} users={users}/></details>}
 </section>
 <p className="pv2-muted">Use “Share with client” in the project header to invite or revoke access for this exact project.</p></div>;
}
const pages:{[key in ProjectPageSlug]:(p:{d:WorkspaceData})=>React.ReactNode}={
 overview:Overview,timeline:Timeline,documents:Documents,payments:Payments,
 procurement:Procurement,labour:Labour,execution:Execution,checks:Checks,designs:Designs,team:Team,
};
export async function ProjectV2Page({id,view}:{id:string;view:ProjectPageSlug}){
 const data=await projectWorkspace(id);
 const organization=await activeOrganization();
 const nav=organization?ownerWorkspaceNavigation(organization):[];
 const Component=pages[view];
 return <OwnerShell companyName={data.company} accountLabel={data.email.split('@')[0]||'Company member'}
  accountEmail={data.email} planLabel="Business workspace" currentHref="/dashboard/projects"
  navigation={nav} search="" notificationsEnabled={organization?canAccess(organization,{
   organizationId:organization.organizationId,permission:'notification.view'}):false} dashboardBrand>
  <main className="pv2-page" id="main-content">
   <nav className="pv2-crumb" aria-label="Breadcrumb"><Link href="/dashboard/projects">Projects</Link>
    <span>›</span><Link href={cur(data.project.id,'overview')}>{data.project.name}</Link>
    <span>›</span><strong>{projectPages.find(x=>x.slug===view)?.title}</strong></nav>
   <ProjectHeader data={data} active={view}/>
   <section className="pv2-view">{Component&&<Component d={data}/>}</section>
  </main>
 </OwnerShell>;
}
