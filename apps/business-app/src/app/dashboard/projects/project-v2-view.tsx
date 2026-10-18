import Link from 'next/link';
import Image from 'next/image';
import { OwnerIcon, type OwnerIconName, OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { OwnerMobileNav } from '../owner-mobile-nav';
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
 return <span className={'pv2-status '+(['active','ongoing','paid','passed','approved','received','completed','signed'].includes(value)
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
  {p.progress!==null&&<div className="pv2-header-progress">
   <span>Overall progress <strong>{p.progress}%</strong></span>
   <div className="pv2-bar"><span style={{width:p.progress+'%'}}/></div>
  </div>}
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
 const signed=d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true;
 const canSurvey=d.permissions.manage||['manager','site_engineer'].includes(d.site?.role??'');
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
    !inspection&&canSurvey?<details className="pv2-next-drawer" open>
      <summary>Record site inspection</summary>
      <ProjectSiteSurvey projectId={d.project.id} kind="inspection" previous={d.preflight?.inspectionDetails}/>
     </details>:
    inspection&&!measurement&&canSurvey?<details className="pv2-next-drawer" open>
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
    <div><strong>Advance payment</strong><small>{invoice===null?'Finance status unavailable':paid?'Verified receipt recorded':invoice?.invoiceId?'Payment requested':'Not yet requested'}</small></div></div>
   <strong className="pv2-priority-amount">{invoice===null?'—':invoice?.invoiceId?formatMoney(invoice.invoiceTotal):'Not invoiced'}</strong>
   {invoice?.invoiceId?<div className="pv2-priority-payment-meta">
     <span>{invoice.invoiceNumber||'Advance proforma'}</span><Status value={paid?'paid':invoice.invoiceStatus||'pending'}/>
     <p>{formatMoney(received)} received · {formatMoney(advanceDue)} remaining</p>
    </div>:<p className="pv2-next-subtle">A signed agreement does not mean payment has arrived.</p>}
   {signed&&invoice!==null&&!invoice.invoiceId&&d.permissions.finance&&d.permissions.manage&&
    <details className="pv2-next-drawer"><summary>Issue advance invoice</summary>
     <ProjectAdvanceAction projectId={d.project.id} defaultPercent={guess}/>
    </details>}
   {invoice?.invoiceId&&<a className="pv2-next-secondary" href={'/dashboard/finance/invoices/'+invoice.invoiceId}>
    View invoice <OwnerIcon name="arrow" size={13}/></a>}
   {invoice!==null&&!invoice.scheduleActive&&signed&&<p className="pv2-next-subtle">
    Payment schedule still needs activation before physical construction.</p>}
  </aside>
 </section>;
}

/** One actionable project surface. Detail modules keep the original records,
 * while project stages and inline forms give the owner a single place to work. */
function ProjectFinancialSummary({d}:{d:WorkspaceData}){
 const received=d.transactions===null?null:d.transactions.filter(x=>x.status==='recorded')
  .reduce((sum,x)=>sum+x.amount,0);
 const balance=received===null||d.expenditure===null?null:received-d.expenditure;
 const cards=[
  {title:'Project Total Cost',amount:d.contractValue,detail:'Agreed contract value',tone:'orange',icon:'billing' as OwnerIconName},
  {title:'Payment Received',amount:received,detail:'Recorded client receipts',tone:'green',icon:'billing' as OwnerIconName},
  {title:'Expenses',amount:d.expenditure,detail:d.expenditure===null?'Project expense ledger unavailable':'Actual recorded project costs',tone:'red',icon:'expenses' as OwnerIconName},
  {title:'Balance from Received',amount:balance,detail:'Received minus actual expenses',tone:'purple',icon:'billing' as OwnerIconName},
 ];
 return <section className="pv2-financial-cards" aria-label="Project financial summary">
  {cards.map(card=><article className={'pv2-financial-card pv2-money-'+card.tone} key={card.title}>
    <span className="pv2-money-icon"><OwnerIcon name={card.icon} size={23}/></span>
    <div><span className="pv2-money-title">{card.title}</span>
     <strong>{formatMoney(card.amount)}</strong><small>{card.detail}</small></div>
   </article>)}
 </section>;
}
function ProjectStageBoard({d}:{d:WorkspaceData}){
 const site=d.site;
 const done=(status:string)=>['completed','certified','done','skipped'].includes(status);
 const active=d.stages.findIndex(stage=>!done(stage.status));
 const current=active<0?d.stages.length-1:active;
 const allowWork=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','site_engineer','supervisor'].includes(site.role));
 const allowMaterials=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','procurement','site_engineer'].includes(site.role));
 const allowChecks=site?.stage==='execution'&&
  (site.canManage||['manager','project_manager','quality_inspector','site_engineer'].includes(site.role));
 return <section className="pv2-panel pv2-command-stages" id="project-timeline">
  <div className="pv2-command-head">
   <div><h2>Project timeline</h2>
    <p>Manage stages, work, payments, materials, labour, photos and checks in one place.</p></div>
   <span className="pv2-timeline-counter">{d.stages.length} stages</span>
  </div>
  {!d.stages.length?<div className="pv2-stage-empty">
    <p>Stages are created from the signed agreement and its approved quotation; no generic stages are inserted.</p>
    {d.site?.canManage&&d.agreement&&<SyncStages id={d.project.id}/>}
    {!d.agreement&&<p>Complete the quotation and agreement first.</p>}
   </div>:<div className="pv2-command-stage-list">
    {d.stages.map((stage,index)=>{
      const complete=done(stage.status);
      const guidance=guidanceForConstructionStage(stage.template_code);
      const checks=[...new Set([...stage.inspectionTopics,...guidance.checks])];
      const payment=d.quotePaymentTriggers.filter(p=>p.stageCodes.includes(stage.instance_code));
      const linked=d.links.filter(x=>x.stage_id===stage.id);
      const availableRecords:StageLinkOption[]=[
       ...(site?.reports??[]).map(x=>({kind:'report' as const,id:x.id,title:shortDate(x.report_date)+' — '+stringValue(x.completed_work)})),
       ...(site?.materials??[]).map(x=>({kind:'material' as const,id:x.id,title:stringValue(x.item)})),
       ...(site?.checks??[]).map(x=>({kind:'check' as const,id:x.id,title:stringValue(x.title)})),
       ...(site?.media??[]).filter(x=>x.category!=='agreement').map(x=>({kind:'media' as const,id:x.id,title:stringValue(x.filename)})),
      ];
      return <details className={'pv2-command-stage '+(complete?'is-complete':'')+
       (index===current?' is-current':'')} key={stage.id} open={index===current}>
       <summary className="pv2-command-stage-summary">
        <span className="pv2-stage-number">{complete?'✓':index+1}</span>
        <span className="pv2-stage-title-block"><strong>{stage.title}</strong>
         <small>{stage.floor_code?pretty(stage.floor_code)+' · ':''}{stage.phase?pretty(stage.phase)+' · ':''}{stage.activities.length} work items</small></span>
        <Status value={stage.status}/>
        <span className="pv2-stage-meta">{payment.length} payment milestone{payment.length===1?'':'s'}</span>
        <OwnerIcon name="arrow" size={15}/>
       </summary>
       <div className="pv2-command-stage-inner">
        {stage.explanation&&<p className="pv2-muted">{stage.explanation}</p>}
        {!!stage.dependencies.length&&<p className="pv2-stage-hint">Dependent on: {stage.dependencies.join(' · ')}</p>}
        <div className="pv2-command-work-list">
         {stage.activities.map((work,i)=><div className="pv2-command-work-item" key={i}>
           <span className="pv2-work-bullet"><OwnerIcon name={complete?'check':'projects'} size={15}/></span>
           <span>{work}</span>
           {complete&&<span className="pv2-label">Stage completed</span>}
          </div>)}
        </div>
        {payment.length>0&&d.permissions.finance&&<div className="pv2-command-payments">
         <OwnerIcon name="billing" size={17}/><div><strong>Linked quotation payments</strong>
          <p>{payment.map(p=>p.name+' ('+p.percent+'%)').join(' · ')}</p>
          <small>Milestones are not receipts until payments are recorded.</small></div>
         </div>}
        {!!checks.length&&<details className="pv2-stage-secondary"><summary>Checks & tests ({checks.length})</summary>
         <ul>{checks.map((name,i)=><li key={i}>{name}</li>)}</ul></details>}
        {!!guidance.materials.length&&<details className="pv2-stage-secondary"><summary>Materials to plan</summary>
         <ul>{guidance.materials.map((name,i)=><li key={i}>{name}</li>)}</ul></details>}
        <div className="pv2-stage-attachment-count">{linked.length} linked site record{linked.length===1?'':'s'} · Linked evidence is not an approval.</div>
        <div className="pv2-command-stage-actions">
         {allowWork&&<details><summary><OwnerIcon name="projects" size={16}/> Update work</summary><SiteReportForm id={d.project.id}/></details>}
         {site?.stage==='execution'&&<details><summary><OwnerIcon name="projects" size={16}/> Upload photos</summary><SiteMediaForm id={d.project.id}/></details>}
         {allowMaterials&&<details><summary><OwnerIcon name="purchases" size={16}/> Request materials</summary><MaterialRequestForm id={d.project.id}/></details>}
         {allowChecks&&<details><summary><OwnerIcon name="check" size={16}/> Quality check</summary><QualityForm id={d.project.id}/></details>}
         {site?.canManage&&!!site.memberOptions.length&&<details><summary><OwnerIcon name="team" size={16}/> Assign team</summary><AssignRole projectId={d.project.id} users={site.memberOptions}/></details>}
        </div>
        {site?.canManage&&availableRecords.length>0&&<details className="pv2-stage-secondary"><summary>Attach existing site evidence</summary>
         <ProjectStageLinker projectId={d.project.id} stageId={stage.id} options={availableRecords}/></details>}
       </div>
      </details>;
    })}
   </div>}
 </section>;
}
function ProjectCommandSidebar({d,showHistory=false}:{d:WorkspaceData;showHistory?:boolean}){
 const recent=timeline(d).slice(0,5);
 const signed=d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true;
 const needsAdvance=signed&&d.advance!==null&&(!d.advance?.invoiceId||
    (d.advance.invoiceTotal>0&&d.advance.received<d.advance.invoiceTotal));
 const incompleteChecks=d.site?.checks.filter(r=>!['passed','approved'].includes(stringValue(r.status)))??[];
 return <aside className="pv2-command-sidebar">
  <section className="pv2-panel pv2-attention">
   <div className="pv2-command-head"><h2>Needs your attention</h2><span className="pv2-timeline-counter">
     {(needsAdvance?1:0)+incompleteChecks.length+(d.preflight&&!d.preflight.inspectionDone?1:0)} pending</span></div>
   {needsAdvance&&<div className="pv2-attention-item">
     <span className="pv2-attention-symbol"><OwnerIcon name="billing" size={20}/></span>
     <div><strong>Advance payment pending</strong><p>{d.advance?.invoiceId?'Record a verified client receipt before treating the advance as paid.':'Issue the advance invoice from the next action below.'}</p></div>
    </div>}
   {incompleteChecks.slice(0,2).map(ch=><div className="pv2-attention-item" key={ch.id}>
    <span className="pv2-attention-symbol"><OwnerIcon name="check" size={20}/></span>
    <div><strong>{stringValue(ch.title)||'Quality check'}</strong><p>{pretty(ch.status)||'Pending review'}</p></div>
   </div>)}
   {d.preflight&&!d.preflight.inspectionDone&&<div className="pv2-attention-item">
    <span className="pv2-attention-symbol"><OwnerIcon name="calendar" size={20}/></span>
    <div><strong>Site inspection needed</strong><p>Record the survey and measurements before floor planning.</p></div></div>}
   {!needsAdvance&&!incompleteChecks.length&&(!d.preflight||d.preflight.inspectionDone)&&
    <p className="pv2-muted">No outstanding project alerts from the available records.</p>}
   <ProjectPriority d={d}/>
  </section>
  <section className="pv2-panel">
   <div className="pv2-command-head"><h2>{showHistory?'Project activity':'Recent updates'}</h2>
     <span className="pv2-timeline-counter">{recent.length} updates</span></div>
   {recent.length?recent.map(entry=><div className="pv2-activity-row" key={entry.kind+entry.id}>
    <span className="pv2-activity-icon"><OwnerIcon name={entry.kind==='check'?'check':entry.kind==='material'?'purchases':'projects'} size={16}/></span>
    <div><strong>{entry.title}</strong><p>{entry.description}</p>
      <small>{shortDate(entry.date)}</small></div></div>):
    <p className="pv2-muted">No project activity recorded yet.</p>}
  </section>
  <section className="pv2-panel pv2-command-quick">
   <div className="pv2-command-head"><h2>Quick actions</h2></div>
   <div className="pv2-command-quick-actions">
    {d.site?.stage==='execution'&&
     <details><summary><OwnerIcon name="projects" size={16}/> Add work update</summary><SiteReportForm id={d.project.id}/></details>}
    {d.site?.stage==='execution'&&
     <details><summary><OwnerIcon name="projects" size={16}/> Add photo</summary><SiteMediaForm id={d.project.id}/></details>}
    {d.site?.stage==='execution'&&
     <details><summary><OwnerIcon name="purchases" size={16}/> Request material</summary><MaterialRequestForm id={d.project.id}/></details>}
    {d.site?.canManage&&
     <details><summary><OwnerIcon name="team" size={16}/> Assign labour / team</summary>
      <p className="pv2-hint">Assign existing employees to this project. Daily labour counts are recorded with work updates.</p>
      <AssignRole projectId={d.project.id} users={d.site.memberOptions}/></details>}
    <Link href={cur(d.project.id,'documents')}><OwnerIcon name="quotations" size={16}/> Documents</Link>
    {d.permissions.finance&&<Link href={cur(d.project.id,'payments')}><OwnerIcon name="billing" size={16}/> Payment history</Link>}
   </div>
  </section>
 </aside>;
}
function ProjectWorkHub({d,showHistory=false}:{d:WorkspaceData;showHistory?:boolean}){
 return <div className="pv2-content pv2-command-workspace">
  <ProjectFinancialSummary d={d}/>
  {d.site&&['not_started','design','client_approved'].includes(d.site.stage)&&
   <section className="pv2-command-delivery"><ProjectLifecycle id={d.project.id}
    stage={d.site.stage} canManage={d.site.canManage}
    agreementSigned={d.agreement?.clearanceType==='signed_copy_recorded'||d.preflight?.signedReady===true}
    industry={d.project.industry}
    designs={d.site.designs.map(row=>({id:row.id,kind:stringValue(row.kind),status:stringValue(row.status)}))}/></section>}
  <div className="pv2-command-layout">
   <ProjectStageBoard d={d}/>
   <ProjectCommandSidebar d={d} showHistory={showHistory}/>
  </div>
 </div>;
}
function Overview({d}:{d:WorkspaceData}){return <ProjectWorkHub d={d}/>;}

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
function Timeline({d}:{d:WorkspaceData}){return <ProjectWorkHub d={d} showHistory/>;}
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
     <p>One final quotation, one agreement, and a clear next action.</p></section>
    <section className="pv2-panel pv2-quote-links">
     <Title title="Final Quotation" detail="The quotation linked to this project's agreed scope."/>
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
     {d.permissions.quotation&&<details className="pv2-secondary-more"><summary>Quotation history / change Final</summary>
      <NextLink href="/dashboard/quotations" label="Manage quotation history"/>
     </details>}
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
  <OwnerMobileNav currentHref="/dashboard/projects"
   navigation={nav.filter(item=>['Dashboard','Projects','My Sites','Finance','Team','Settings'].includes(item.label))
    .filter(item=>item.label!=='My Sites'||!nav.some(x=>x.label==='Projects')).slice(0,5)}/>
 </OwnerShell>;
}
