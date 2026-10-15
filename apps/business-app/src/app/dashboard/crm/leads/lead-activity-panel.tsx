import { crmServices, resultSchema } from '../service';
import { LeadActivityQueue, type ActivityQueueItem } from './lead-activity-queue';

type Services = Awaited<ReturnType<typeof crmServices>>;
export type ActivityView = 'followups' | 'visits';
export type ActivityQueueFilter = 'today' | 'overdue' | 'upcoming' | '';

export async function LeadActivityPanel({
  services, activity, queue, page, canManageFollowups, canManageVisits,
}: {
  services: Services;
  activity: ActivityView;
  queue: ActivityQueueFilter;
  page: number;
  canManageFollowups: boolean;
  canManageVisits: boolean;
}) {
  const searches: {entity:'site_visits'|'lead_followups';filter:Record<string,string>;kind:'visit'|'followup'}[] =
    activity === 'visits' ? [
      {entity:'site_visits',filter:{status:'scheduled',...(queue ? {queue} : {})},kind:'visit'},
      {entity:'site_visits',filter:{status:'rescheduled',...(queue ? {queue} : {})},kind:'visit'},
      {entity:'lead_followups',filter:{status:'pending',type:'meeting',...(queue ? {queue} : {})},kind:'followup'},
    ] : [
      {entity:'lead_followups',filter:{status:'pending',...(queue ? {queue} : {})},kind:'followup'},
    ];
  // The original CRM permissions and organization-scope are preserved. Each
  // query uses the same searchable records that powered the old queue pages.
  const data = await Promise.all(searches.map(async (search) => {
    const output = resultSchema.parse(
      await services.crm.search(search.entity,search.filter,page));
    return { ...output,kind:search.kind };
  }));
  const leadIds = [...new Set(data.flatMap((entry) => entry.rows.map((row) =>
    typeof row.lead_id === 'string' ? row.lead_id : null).filter((id):id is string=>Boolean(id))))];
  const result = leadIds.length ? await services.client.from('leads')
    .select('id,name,lead_number,phone,phone_normalized')
    .eq('organization_id', services.org).in('id', leadIds) : {data:[]};
  const leadMap = new Map((result.data??[]).map((row)=>[row.id,row]));
  const items:ActivityQueueItem[] = data.flatMap(({rows,kind}) =>
    rows.flatMap((row) => {
      if(typeof row.id!=='string'||typeof row.lead_id!=='string')return [];
      const lead=leadMap.get(row.lead_id);
      if(!lead)return [];
      const appointment=typeof row.scheduled_at==='string'?row.scheduled_at:
        typeof row.due_at==='string'?row.due_at:'';
      const note=typeof row.notes==='string'?row.notes:
        typeof row.note==='string'?row.note:'';
      const address = kind==='visit' && row.site_address &&
        typeof row.site_address === 'object' && !Array.isArray(row.site_address) &&
        'line1' in row.site_address && typeof row.site_address.line1 === 'string'
        ? row.site_address.line1 : '';
      const label=kind==='visit'?'Site visit':
        (typeof row.followup_type==='string'&&row.followup_type==='meeting')?
          'Office visit / meeting':'Follow-up call';
      return [{
        id:row.id,
        leadId:lead.id,
        name:lead.name,
        leadNumber:lead.lead_number??'',
        phone:lead.phone_normalized||lead.phone||'',
        version:typeof row.version==='number'?row.version:1,
        kind,
        label,
        status:typeof row.status==='string'?row.status:'',
        date:appointment,
        notes:address ? address + (note ? ' · ' + note : '') : note,
      } satisfies ActivityQueueItem];
    }),
  ).sort((a,b)=>a.date.localeCompare(b.date));
  const total = data.reduce((sum,entry)=>sum+entry.total,0);
  const query=new URLSearchParams({activity});
  if(queue)query.set('queue',queue);
  const nextHref = data.some((entry)=>entry.total>page*25)
    ? '/dashboard/crm/leads?'+query.toString()+'&page='+String(page+1)+'#lead-activities'
    : null;
  return <LeadActivityQueue items={items} total={total}
    canManageFollowups={canManageFollowups} canManageVisits={canManageVisits}
    nextHref={nextHref}/>;
}
