/** Presentation-only adapters over existing tenant-scoped project RPC data.
 * Never infer a cash receipt from a payment request or a purchase from a material need.
 */
export type SiteRow={id:string;[key:string]:unknown};
export type Stage={
 id:string;instance_code:string;phase:string;floor_code:string|null;title:string;
 explanation:string;status:string;task_count:number;activities:string[];
};
export type StagePayment={
 stage_id:string;item_id:string;contract_id:string;label:string;amount:string;
 due_date:string|null;currency:string;contract_number:string;
 request_number:string|null;request_status:string|null;
};
export type StageRecord={
 links:{stage_id:string;kind:string;record_id:string}[];
 payments:StagePayment[];
 options:{id:string;contract_id:string;label:string;amount:string;currency:string;contract_number:string}[];
};
export type ProjectActivity={
 id:string;kind:'execution'|'procurement'|'quality'|'document'|'payment';
 title:string;description:string;date:string;status:string;
 href:string;stageId?:string;
};
export function textValue(record:Record<string,unknown>|undefined,key:string):string {
 const value=record?.[key];
 return typeof value==='string'||typeof value==='number'?String(value):'';
}
export function human(value:string):string {
 return value.replaceAll('_',' ').replace(/\b\w/g,s=>s.toUpperCase());
}
export function friendlyDate(value:string|null|undefined):string {
 if(!value)return 'Not scheduled';
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?'Not scheduled':
  new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(parsed);
}
export function location(value:unknown):string {
 if(!value||typeof value!=='object'||Array.isArray(value))return 'Site address not recorded';
 const a=value as Record<string,unknown>;
 return ['line1','city','region','postal_code'].map(k=>textValue(a,k)).filter(Boolean).join(', ')||
  'Site address not recorded';
}
export function safeCount(rows:SiteRow[]|null|undefined):number|null{
 return rows?rows.length:null;
}
export function linkedStageCounts(stageId:string,linked:StageRecord|null){
 const values=(linked?.links??[]).filter(x=>x.stage_id===stageId);
 return {
  materials:values.filter(x=>x.kind==='material').length,
  reports:values.filter(x=>x.kind==='report').length,
  checks:values.filter(x=>x.kind==='check').length,
  photos:values.filter(x=>x.kind==='media').length,
  payments:(linked?.payments??[]).filter(x=>x.stage_id===stageId).length,
 };
}
export function activityFeed(args:{
 projectId:string;site: {
  reports:SiteRow[];materials:SiteRow[];checks:SiteRow[];media:SiteRow[];
 }|null;stageRecord:StageRecord|null;showFinance:boolean;
}):ProjectActivity[]{
 const {projectId,site,stageRecord,showFinance}=args;
 if(!site)return [];
 const root='/dashboard/projects/'+projectId+'/site';
 const items:ProjectActivity[]=[];
 for(const row of site.reports){
  items.push({
   id:'report-'+row.id,kind:'execution',title:'Site work update',
   description:textValue(row,'completed_work')||textValue(row,'tomorrow_plan')||'Site progress recorded',
   date:textValue(row,'report_date'),status:'recorded',href:root+'#daily-reports',
  });
 }
 for(const row of site.materials){
  items.push({
   id:'material-'+row.id,kind:'procurement',title:textValue(row,'item')||'Material request',
   description:[textValue(row,'quantity'),textValue(row,'unit')].filter(Boolean).join(' '),
   date:textValue(row,'created_at'),status:textValue(row,'status')||'requested',href:root+'#materials',
  });
 }
 for(const row of site.checks){
  items.push({
   id:'check-'+row.id,kind:'quality',title:textValue(row,'title')||'Quality check',
   description:textValue(row,'notes')||'Quality inspection entry',
   date:textValue(row,'due_date')||textValue(row,'created_at'),
   status:textValue(row,'status')||'pending',href:root+'#quality',
  });
 }
 for(const row of site.media){
  items.push({
   id:'media-'+row.id,kind:'document',title:textValue(row,'filename')||'Project evidence',
   description:textValue(row,'category')||'Uploaded project evidence',
   date:textValue(row,'created_at'),status:'uploaded',href:root+'#media',
  });
 }
 if(showFinance)for(const p of stageRecord?.payments??[]){
  items.push({
   id:'payment-'+p.item_id+'-'+p.stage_id,kind:'payment',
   title:p.label||'Client payment milestone',
   description:p.request_number?'Payment request '+p.request_number:'Payment request not issued',
   date:p.due_date??'',status:p.request_status??'not_requested',
   href:'/dashboard/finance/contracts?project_id='+projectId,stageId:p.stage_id,
  });
 }
 // Do not manufacture timestamps for records without one. Undated events
 // remain visible after dated events, preserving all entries.
 return items.sort((a,b)=>b.date.localeCompare(a.date));
}
export function moduleCounts(site:{
 reports:SiteRow[];materials:SiteRow[];checks:SiteRow[];media:SiteRow[];designs:SiteRow[];team:SiteRow[];gate:SiteRow[];
}|null){
 if(!site)return null;
 return {
  reports:site.reports.length,materials:site.materials.length,checks:site.checks.length,
  media:site.media.length,designs:site.designs.length,team:site.team.length,gate:site.gate.length,
  pendingMaterials:site.materials.filter(m=>!['received','rejected'].includes(textValue(m,'status'))).length,
  pendingChecks:site.checks.filter(c=>textValue(c,'status')!=='passed').length,
 };
}
