import Link from 'next/link';
import Image from 'next/image';
import { OwnerIcon } from '../../owner-shell';
import { MasterForm } from '../../commercial/master-form';
import {
 activityFeed,friendlyDate,human,linkedStageCounts,location,moduleCounts,textValue,
 type SiteRow,type Stage,type StageRecord,
} from './project-command-data';

type ProjectInfo={
 id:string;name:string;code:string;status:string;projectType:string;
 siteAddress:unknown;notes:string|null;
};
type SiteData={
 stage:string;can_manage:boolean;role:string|null;
 team:SiteRow[];member_options:{id:string;label:string}[];
 designs:SiteRow[];reports:SiteRow[];checks:SiteRow[];
 materials:SiteRow[];media:SiteRow[];gate:SiteRow[];
};
type Agreement={
 contract_number:string|null;contract_status:string|null;
 contract_value:string|null;currency:string|null;active_schedule:boolean;
 advance_required:boolean;advance_received:boolean;execution_authorized:boolean;
};
type Access={email:string;active:boolean;created_at:string};
function Pill({status}: {status:string}){
 const normalized=status.toLowerCase().replace(/[^a-z_]/g,'');
 const positive=['active','completed','approved','passed','received','delivered','verified','paid','handover'];
 const caution=['requested','pending','recheck','awaiting','not_requested','issued','in_progress','ordered'];
 const mood=positive.includes(normalized)?'good':caution.includes(normalized)?'pending':'neutral';
 return <span className={'pcc-pill pcc-pill-'+mood}>{human(status||'Not recorded')}</span>;
}
function Panel({id,title,href,children,note}:{id:string;title:string;href?:string;children:React.ReactNode;note?:string}){
 return <section className="pcc-panel" id={id}>
  <header className="pcc-panel-heading"><div><h2>{title}</h2>{note&&<p>{note}</p>}</div>
  {href&&<Link href={href}>Open workspace <span aria-hidden="true">↗</span></Link>}</header>
  {children}
 </section>;
}
function Empty({message}: {message:string}){return <p className="pcc-empty">{message}</p>;}
function TruncatedList({rows,render,max=5}:{
 rows:SiteRow[];render:(row:SiteRow,index:number)=>React.ReactNode;max?:number;
}){
 return <div className="pcc-record-list">{rows.slice(0,max).map((row,index)=>
  <div className="pcc-record" key={row.id}>{render(row,index)}</div>)}</div>;
}
function Count({number,label}: {number:number|null;label:string}) {
 return <span className="pcc-count"><strong>{number===null?'—':number}</strong><small>{label}</small></span>;
}
// One workspace per project function; only the selected workspace renders.
const projectSections=[
 {id:'documents',label:'Documents & Agreement'},
 {id:'payments',label:'Client Payments'},
 {id:'designs',label:'Designs'},
 {id:'team',label:'Team & Owner'},
 {id:'materials',label:'Materials & Procurement'},
 {id:'labour',label:'Labour'},
 {id:'execution',label:'Execution'},
 {id:'checks',label:'Checks & Quality'},
 {id:'timeline',label:'Timeline'},
] as const;

export function ProjectCommandCentre({project,industry,customer,site,stages,stageRecords,
 agreement,access,progress,canManage,canFinance,canPurchase,canSeeCustomer,
 canManageCustomer,canSeeQuotes,upcomingTask,areaCount,settingsInitial,branches,view='overview'}:{
 project:ProjectInfo;industry:string;customer:{id:string;name:string}|null;
 site:SiteData|null;stages:Stage[];stageRecords:StageRecord|null;
 agreement:Agreement|null;access:Access[]|null;progress:number|null;
 canManage:boolean;canFinance:boolean;canPurchase:boolean;
 canSeeCustomer:boolean;canManageCustomer:boolean;canSeeQuotes:boolean;
 upcomingTask:{title:string;planned_start:string|null}|null;areaCount:number;
 settingsInitial:Record<string,unknown>;branches:{id:string;name:string}[];
 view?:string;
}) {
 const id=project.id,base='/dashboard/projects/'+id,siteUrl=base+'/site';
 const counts=moduleCounts(site);
 const allowedViews=['overview',...projectSections.filter(x=>x.id!=='payments'||canFinance).map(x=>x.id)];
 const selectedView=allowedViews.includes(view)?view:'overview';
 const selectedTitle=selectedView==='overview'?'Project Overview':
  projectSections.find(section=>section.id===selectedView)?.label??'Project Overview';
 const workspaceUrl=(tab:string)=>base+'?view='+tab;
 const activities=activityFeed({projectId:id,site,stageRecord:stageRecords,showFinance:canFinance});
 const stagePayments=canFinance?stageRecords?.payments??[]:[];
 const paymentOptions=canFinance?stageRecords?.options??[]:[];
 const heroMedia=site?.media.find(row=>textValue(row,'mime').startsWith('image/')&&
  ['site','daily','inspection'].includes(textValue(row,'category')));
 const latestReports=[...(site?.reports??[])].sort((a,b)=>
  textValue(b,'report_date').localeCompare(textValue(a,'report_date')));
 const latestReport=latestReports[0];
 const newestDesigns=new Map<string,SiteRow>();
 for(const design of site?.designs??[]){
  const kind=textValue(design,'kind')||'design';
  const existing=newestDesigns.get(kind);
  if(!existing||Number(textValue(design,'revision'))>Number(textValue(existing,'revision')))
   newestDesigns.set(kind,design);
 }
 // Do not convert issued requests into "received" amounts; cash must be
 // verified through the existing Finance invoice/receipt allocation system.
 const currentStage=stages.find(s=>!['completed','certified','skipped'].includes(s.status));
 const stageStatus=site?.stage??'not_started';
 return <main id="main-content" tabIndex={-1} className="pcc-page">
  <nav className="pcc-breadcrumb" aria-label="Breadcrumb"><Link href="/dashboard/projects">Projects</Link>
   <span>›</span><strong>{project.name}</strong></nav>
  <header className="pcc-heading"><div><h1>{selectedTitle}</h1>
   <p>{project.name} · {project.code||industry||'Company project'}</p></div>
   {canManage&&<Link className="pcc-primary" href={workspaceUrl('overview')+'#settings'}>
    <OwnerIcon name="settings" size={16}/> Edit Project</Link>}
  </header>
  <nav className="pcc-workspaces" aria-label="Project workspaces">
   {[
    {id:'overview',label:'Overview'},
    {id:'timeline',label:'Timeline'},
    {id:'execution',label:'Execution'},
    {id:'materials',label:'Materials'},
    {id:'checks',label:'Checks'},
    ...(canFinance?[{id:'payments',label:'Payments'}]:[]),
   ].map(section=><Link key={section.id} href={workspaceUrl(section.id)}
    aria-current={selectedView===section.id?'page':undefined}
    className={selectedView===section.id?'active':''}>{section.label}</Link>)}
   <details className="pcc-more-menu">
    <summary className={['documents','designs','team','labour'].includes(selectedView)?'active':''}>
     {['documents','designs','team','labour'].includes(selectedView)?selectedTitle:'More'} <span aria-hidden="true">⌄</span>
    </summary>
    <div className="pcc-more-links">
     {projectSections.filter(section=>['documents','designs','team','labour'].includes(section.id))
      .map(section=><Link key={section.id} href={workspaceUrl(section.id)}
       aria-current={selectedView===section.id?'page':undefined}
       className={selectedView===section.id?'active':''}>{section.label}</Link>)}
    </div>
   </details>
  </nav>
  {selectedView==='overview'&&<>
  <section className={'pcc-project-hero '+(!heroMedia?'pcc-no-photo':'')}>
   {heroMedia&&<div className="pcc-photo">
    <Image unoptimized fill sizes="(max-width: 700px) 100vw, 260px"
     src={siteUrl+'/media/'+heroMedia.id}
     alt={textValue(heroMedia,'caption')||'Recorded project site photograph'}/>
   </div>}
   <div className="pcc-project-info">
    <div className="pcc-project-title"><h2>{project.name}</h2><Pill status={project.status}/></div>
    <small>{project.code||'Project code not assigned'} · {industry||human(project.projectType||'Project')}</small>
    <div className="pcc-project-facts">
     <div><OwnerIcon name="clients" size={17}/><span>Client<strong>{customer?.name??(canSeeCustomer?'Not linked':'Restricted')}</strong></span></div>
     <div><OwnerIcon name="globe" size={17}/><span>Site address<strong>{location(project.siteAddress)}</strong></span></div>
     <div><OwnerIcon name="calendar" size={17}/><span>Current delivery<strong>{human(stageStatus)}</strong></span></div>
     <div><OwnerIcon name="projects" size={17}/><span>Areas & rooms<strong>{areaCount} recorded</strong></span></div>
    </div>
    <div className="pcc-hero-bottom">
     <div><small>Overall work progress</small><strong>{progress===null?'Not tracked':progress+'%'}</strong></div>
     <div className="pcc-progress" role={progress===null?undefined:'progressbar'}
      aria-label="Recorded work completion" aria-valuenow={progress??undefined}
      aria-valuemin={progress===null?undefined:0} aria-valuemax={progress===null?undefined:100}>
      {progress!==null&&<span style={{width:progress+'%'}}/>}</div>
    </div>
   </div>
  </section>
  <section className="pcc-metrics" aria-label="Project status metrics">
   <article><span className="pcc-metric-icon orange"><OwnerIcon name="calendar" size={20}/></span>
    <div><small>Current stage</small><strong>{currentStage?.title||human(stageStatus)}</strong>
     <p>{stages.length?stages.length+' stages in execution plan':'Quote-derived timeline not initialized'}</p></div></article>
   <article><span className="pcc-metric-icon rose"><OwnerIcon name="check" size={20}/></span>
    <div><small>Open quality checks</small><strong>{counts?.pendingChecks??'—'}</strong>
     <p>{counts?'Site checks requiring attention':'Not available for this role'}</p></div></article>
   <article><span className="pcc-metric-icon purple"><OwnerIcon name="purchases" size={20}/></span>
    <div><small>Material needs</small><strong>{counts?.pendingMaterials??'—'}</strong>
     <p>{counts?'Requested / pending delivery':'Not available for this role'}</p></div></article>
  </section>
  </>}
  {selectedView!=='overview'&&<div className="pcc-workspace-context">
   <div><strong>{project.name}</strong><small>{industry||human(project.projectType)} · {human(stageStatus)}</small></div>
   <Pill status={project.status}/>
  </div>}

  <div className="pcc-layout" id="overview">
   <div className="pcc-main">
   {selectedView==='overview'&&<>
   <section className="pcc-overview-actions" aria-label="Quick project actions">
    <Link href={siteUrl+'#daily-reports'}><OwnerIcon name="plus" size={16}/> Add site update</Link>
    <Link href={siteUrl+'#materials'}><OwnerIcon name="purchases" size={16}/> Request material</Link>
    <Link href={siteUrl+'#quality'}><OwnerIcon name="check" size={16}/> Record check</Link>
    <Link href={workspaceUrl('timeline')}><OwnerIcon name="calendar" size={16}/> View timeline</Link>
   </section>
   <section className="pcc-panel pcc-next-work">
    <header className="pcc-panel-heading"><div><h2>Next Work</h2>
     <p>Upcoming work and tomorrow's site plan</p></div>
     <Link href={siteUrl+'#daily-reports'}>Plan work ↗</Link></header>
    <div className="pcc-next-work-items">
     <div><small>Next activity</small><strong>{upcomingTask?.title??'No task scheduled'}</strong>
      <span>{friendlyDate(upcomingTask?.planned_start)}</span></div>
     <div><small>Tomorrow's plan</small>
      <strong>{textValue(latestReport,'tomorrow_plan')||'Not entered'}</strong></div>
    </div>
   </section>
   <section className="pcc-panel pcc-recent-activity">
    <header className="pcc-panel-heading"><div><h2>Recent Activity</h2>
     <p>Latest work, requests and checks in one short feed</p></div>
     <Link href={workspaceUrl('timeline')}>Full history ↗</Link></header>
    {activities.length?<div className="pcc-activity-feed">{activities.slice(0,4).map(a=>
     <Link key={a.id} href={a.href} className="pcc-activity">
      <span className={'pcc-activity-dot '+a.kind}/>
      <div><strong>{a.title}</strong><p>{a.description}</p></div>
      <span className="pcc-activity-meta"><small>{friendlyDate(a.date)}</small></span>
     </Link>)}</div>:<div className="pcc-overview-empty">
     <p>No activity recorded yet. Start with a site update when work begins.</p>
     <Link href={siteUrl+'#daily-reports'}>Add first update →</Link></div>}
   </section>
   </>}
    <div className="pcc-focused-panel" aria-label={selectedTitle}>
     {selectedView==='documents'&&<Panel id="documents" title="Documents & Agreement" href={siteUrl+'#media'}
      note="Private files and the canonical signed agreement">
      {agreement&&<div className="pcc-agreement">
       <div><small>Agreement</small><strong>{agreement.contract_number||'No contract number'}</strong></div>
       <Pill status={agreement.contract_status||'not_recorded'}/>
       <span className="pcc-agreement-flag">{agreement.execution_authorized?'Execution authorized':'Execution authorization pending'}</span>
      </div>}
      {site?.media.length?<TruncatedList rows={site.media} render={row=><>
       <span className="pcc-row-icon">▤</span><div className="pcc-row-content"><strong>{textValue(row,'filename')||human(textValue(row,'category')||'Site document')}</strong>
        <small>{human(textValue(row,'category')||'Evidence')}</small></div>
       <Link href={siteUrl+'/media/'+row.id}>View</Link></>}/>:<Empty message="No project files recorded. Upload an agreement or site evidence in Site Delivery."/>}
      {canSeeQuotes&&<Link className="pcc-inline-link" href={'/dashboard/quotations?project='+id}>View approved quotation →</Link>}
     </Panel>}
     {canFinance&&selectedView==='payments'&&<Panel id="payments" title="Client Payments" href={'/dashboard/finance/contracts?project_id='+id}
      note="Multiple contract milestones and payment requests; settlement stays in Finance">
      {agreement?.contract_value&&<div className="pcc-agreement">
       <div><small>Recorded contract value</small><strong>{agreement.currency||'INR'} {agreement.contract_value}</strong></div>
       <Pill status={agreement.active_schedule?'schedule_active':'schedule_pending'}/>
      </div>}
      {paymentOptions.length||stagePayments.length?<div className="pcc-finance-rows">
       {(paymentOptions.length?paymentOptions:stagePayments.map(p=>({
        id:p.item_id,label:p.label,amount:p.amount,currency:p.currency,
        contract_number:p.contract_number,contract_id:p.contract_id,
       }))).slice(0,6).map((payment,i)=>{
        const request=stagePayments.find(p=>p.item_id===payment.id);
        return <div key={payment.id+'-'+i} className="pcc-finance-row">
         <div><strong>{payment.label||'Payment milestone'}</strong><small>{payment.contract_number}</small></div>
         <div className="pcc-finance-amount"><strong>{payment.currency} {payment.amount}</strong>
          <small>{request?.request_number?'Request '+request.request_number:
           'Not yet linked to a request'}</small></div>
        </div>;
       })}
      </div>:<Empty message="No payment schedule milestones returned. Set the schedule from the existing Finance contract workflow."/>}
      <p className="pcc-disclaimer">Requested or invoiced does not mean paid. Only verified Finance receipts determine client collections.</p>
     </Panel>}
     {selectedView==='designs'&&<Panel id="designs" title="Designs & Approvals" href={siteUrl+'#design'}
      note="The latest revision for each drawing type">
      {newestDesigns.size?<div className="pcc-table-scroll"><table><thead><tr><th>Design</th><th>Revision</th><th>Status</th></tr></thead>
       <tbody>{[...newestDesigns.entries()].map(([kind,row])=><tr key={kind}>
        <td><strong>{human(kind)}</strong></td><td>Rev {textValue(row,'revision')||'—'}</td>
        <td><Pill status={textValue(row,'status')||'pending'}/></td>
       </tr>)}</tbody></table></div>:<Empty message="No design revisions available for this project."/>}
     </Panel>}
     {selectedView==='team'&&<Panel id="team" title="Team & Owner Access" href={siteUrl+'#team'}
      note="Assigned site roles are separate from client portal invitations">
      {site?.team.length?<TruncatedList rows={site.team} render={row=>{
       const userId=textValue(row,'user_id')||textValue(row,'membership_id');
       const label=site.member_options.find(x=>x.id===userId)?.label;
       return <><span className="pcc-person-initial">{(label||human(textValue(row,'role')||'Team')).slice(0,1)}</span>
        <div className="pcc-row-content"><strong>{label||human(textValue(row,'role')||'Assigned member')}</strong>
         <small>{human(textValue(row,'role')||'Site team')}</small></div></>;
      }}/>:<Empty message="No site team assignments recorded yet."/>}
      {access!==null&&<div className="pcc-owner-access">
       <h3>Client / Owner invitation</h3>
       {access.length?access.map(a=><div key={a.email}><span>{a.email}</span><Pill status={a.active?'active':'inactive'}/></div>):
        <p>No verified-email client access configured for this project.</p>}
       {canManageCustomer&&customer&&<Link href={'/dashboard/customers/'+customer.id}>Manage client access →</Link>}
      </div>}
     </Panel>}
     {selectedView==='materials'&&<Panel id="materials" title="Materials & Procurement" href={siteUrl+'#materials'}
      note="Every request, quantity, supplier and sourcing stage in one register">
      {site?.materials.length?<TruncatedList rows={site.materials} render={row=><>
       <span className="pcc-row-icon">▣</span>
       <div className="pcc-row-content">
        <strong>{textValue(row,'item')||'Material requirement'}</strong>
        <small>{[textValue(row,'quantity'),textValue(row,'unit')].filter(Boolean).join(' ')}
         {' · '}{textValue(row,'vendor_reference')||
          human(textValue(row,'source')||'Supplier not selected')}</small>
       </div>
       <Pill status={textValue(row,'status')||'requested'}/>
      </>}/>:<Empty message="No material requirements recorded yet. Add a site material request when work needs supplies."/>}
      <div className="pcc-section-footer">
       <Link href={siteUrl+'#materials'}>Request, order or record receipt →</Link>
       {canPurchase&&<Link href="/dashboard/marketplace/orders">Purchase orders →</Link>}
      </div>
     </Panel>}
     {selectedView==='labour'&&<Panel id="labour" title="Labour" href={siteUrl+'#daily-reports'}
      note="Daily workforce requirements and gate records">
      {latestReport?<><div className="pcc-mini-metrics">
       <Count number={Number(textValue(latestReport,'worker_count')||0)} label="Reported on site"/>
       <Count number={textValue(latestReport,'tomorrow_workers')?
        Number(textValue(latestReport,'tomorrow_workers')):null} label="Needed tomorrow"/>
      </div><p className="pcc-disclaimer">Latest site report: {friendlyDate(textValue(latestReport,'report_date'))}</p></>:
       <Empty message="No labour attendance captured in site reports."/>}
      <div className="pcc-section-footer"><Link href={'/dashboard/billing/labour?project='+id}>
       Open labour disbursements →</Link></div>
     </Panel>}
     {selectedView==='execution'&&<Panel id="execution" title="Execution Updates" href={siteUrl+'#daily-reports'}
      note="Every site work report remains in chronological history">
      {latestReports.length?<TruncatedList rows={latestReports} render={row=><>
       <span className="pcc-row-icon">✓</span><div className="pcc-row-content">
        <strong>{textValue(row,'completed_work')||'Daily site progress update'}</strong>
        <small>{friendlyDate(textValue(row,'report_date'))} · {textValue(row,'worker_count')||'—'} workers</small></div>
       <Pill status="recorded"/></>}/>:<Empty message="No execution work updates entered yet."/>}
     </Panel>}
     {selectedView==='checks'&&<Panel id="checks" title="Checks & Quality" href={siteUrl+'#quality'}
      note="Multiple pass, fail and recheck records through the project">
      {site?.checks.length?<TruncatedList rows={site.checks} render={row=><>
       <span className="pcc-row-icon">✓</span><div className="pcc-row-content">
        <strong>{textValue(row,'title')||'Quality check'}</strong>
        <small>{row.due_date?'Due '+friendlyDate(textValue(row,'due_date')):'No due date'}</small></div>
       <Pill status={textValue(row,'status')||'pending'}/></>}/>:<Empty message="No quality checks recorded yet."/>}
     </Panel>}
    </div>

    {selectedView==='timeline'&&<Panel id="timeline" title="Project Timeline & Work History" href={siteUrl+'#construction-timeline'}
     note="Stage-by-stage execution, with material, check, evidence and payment links on each stage">
     {stages.length?<div className="pcc-stages">
      {stages.map((stage,index)=>{
       const counts=linkedStageCounts(stage.id,stageRecords);
       return <details className="pcc-stage" key={stage.id} open={index===stages.findIndex(s=>!['completed','certified','skipped'].includes(s.status))}>
        <summary><span className="pcc-stage-index">{index+1}</span>
         <span className="pcc-stage-info"><strong>{stage.title}</strong>
          <small>{human(stage.phase)}{stage.floor_code?' · '+human(stage.floor_code):''} · {stage.task_count} tasks</small></span>
         <Pill status={stage.status}/><span className="pcc-disclosure-chevron">⌄</span></summary>
        <div className="pcc-stage-content"><p>{stage.explanation}</p>
         {stage.activities.length>0&&<ul>{stage.activities.slice(0,7).map((a,i)=><li key={i}>{a}</li>)}</ul>}
         <div className="pcc-stage-tags"><span>{counts.materials} material links</span><span>{counts.reports} work reports</span>
          <span>{counts.checks} checks</span><span>{counts.photos} evidence files</span>
          {canFinance&&<span>{counts.payments} payment milestones</span>}</div>
         {canFinance&&stagePayments.filter(p=>p.stage_id===stage.id).map(p=><div className="pcc-stage-payment" key={p.item_id}>
          <span>{p.label} · {p.currency} {p.amount}</span><small>{p.request_number?
           'Request '+p.request_number:'No payment request issued'}</small></div>)}
         <Link href={siteUrl+'#construction-timeline'}>Open stage work & approvals →</Link>
        </div>
       </details>;
      })}
     </div>:<div className="pcc-not-ready"><h3>Timeline not initialized</h3>
      <p>Execution stages come from the approved quotation and agreement. They cannot be guessed or created from a generic construction template.</p>
      <Link href={siteUrl+'#construction-timeline'}>Open Site Delivery →</Link></div>}
     <h3 className="pcc-activity-title">Recurring project activity</h3>
     <p className="pcc-disclaimer">Site execution, material requests, checks and payment requests may recur on every stage. Undated records are shown after dated records.</p>
     {activities.length?<div className="pcc-activity-feed">{activities.slice(0,24).map(a=><Link key={a.id} href={a.href} className="pcc-activity">
      <span className={'pcc-activity-dot '+a.kind}/>
      <div><strong>{a.title}</strong><p>{a.description}</p></div>
      <span className="pcc-activity-meta"><small>{friendlyDate(a.date)}</small><Pill status={a.status}/></span>
     </Link>)}</div>:<Empty message="No dated site updates, requests or quality checks recorded yet."/>}
    </Panel>}
    {canManage&&selectedView==='overview'&&<details id="settings" className="pcc-project-settings">
     <summary><OwnerIcon name="settings" size={18}/> Project details & settings</summary>
     <p>Update the existing project record here. Quotation scope and the work-stage plan remain managed through their dedicated authorized workflow.</p>
     <MasterForm entity="projects" title="Save project" initial={settingsInitial} fields={[
      {key:'name',label:'Project name',required:true},
      {key:'code',label:'Project code',required:true},
      {key:'project_type',label:'Project type'},
      {key:'branch_id',label:'Branch',nullable:true,options:[
       {value:'',label:'Organization'},...branches.map(b=>({value:b.id,label:b.name})),
      ]},
      ...['line1','line2','city','region','postal_code','country_code'].map(key=>({
       key:'site_address.'+key,label:'Site '+key.replaceAll('_',' '),
      })),
      {key:'notes',label:'Internal notes',type:'textarea' as const},
      {key:'status',label:'Status',options:[
       {value:'active',label:'Active'},{value:'inactive',label:'Inactive'},
      ]},
     ]}/>
     <div className="pcc-section-footer">
      <Link href={siteUrl+'#construction-planning'}>Edit execution stages and scope →</Link>
      {canSeeCustomer&&customer&&<Link href={'/dashboard/customers/'+customer.id}>Open linked customer →</Link>}
     </div>
    </details>}
   </div>
  </div>
 </main>;
}
