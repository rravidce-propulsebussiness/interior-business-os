-- Simplified mobile-friendly CRM lead desk: reliable activity previews,
-- quote sharing status, and atomic call/update + optional follow-up logging.
begin;
create or replace function public.crm_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid=p_organization_id;filter_sql text;ordering text;rows jsonb;total bigint;q text;zone text;projection text='*';begin
 perform private.crm_require(org,'lead.view');
 if p_page not between 1 and 10000 or jsonb_typeof(p_filter)<>'object' or octet_length(p_filter::text)>4000 then raise exception 'Invalid search' using errcode='22023';end if;
 select default_timezone into zone from public.organizations where id=org;
 q=replace(replace(replace(lower(coalesce(p_filter->>'q','')),'\','\\'),'%','\%'),'_','\_')||'%';
 if p_entity='leads' then
  filter_sql='organization_id=$1 and (lower(name) like $2 or lower(lead_number) like $2 or phone_normalized like $2 or email_normalized like $2) and ($3->>''stage_id'' is null or stage_id=($3->>''stage_id'')::uuid) and ($3->>''assigned_to'' is null or assigned_to=($3->>''assigned_to'')::uuid) and ($3->>''source_id'' is null or source_id=($3->>''source_id'')::uuid) and ($3->>''branch_id'' is null or branch_id=($3->>''branch_id'')::uuid) and ($3->>''priority'' is null or priority=$3->>''priority'') and (($3->>''lifecycle'' is null and lifecycle<>''archived'') or lifecycle=$3->>''lifecycle'') and ($3->>''converted'' is null or (converted_at is not null)=($3->>''converted'')::boolean) and ($3->>''from'' is null or created_at>=($3->>''from'')::date) and ($3->>''until'' is null or created_at<($3->>''until'')::date+1) and (coalesce(($3->>''unassigned'')::boolean,false)=false or assigned_to is null) and ($3->>''due'' is null or next_follow_up_at<=now())';
  projection='t.*,(select p.full_name from public.profiles p where p.id=t.assigned_to) assignee_name,(select s.name from public.lead_sources s where s.id=t.source_id) source_name,(select a.body from public.lead_activities a where a.lead_id=t.id and not a.system_generated order by a.occurred_at desc,a.id desc limit 1) latest_activity,(select a.occurred_at from public.lead_activities a where a.lead_id=t.id and not a.system_generated order by a.occurred_at desc,a.id desc limit 1) latest_activity_at,(select a.subject from public.lead_activities a where a.lead_id=t.id and not a.system_generated order by a.occurred_at desc,a.id desc limit 1) latest_activity_subject';
  ordering=case p_filter->>'sort' when 'oldest' then 'created_at asc' when 'followup' then 'next_follow_up_at asc nulls last' when 'updated' then 'updated_at desc' when 'budget' then 'budget_max desc nulls last' else 'created_at desc' end||',id';
 elsif p_entity in ('lead_sources','crm_pipeline_stages','crm_lost_reasons','crm_requirement_fields') then
  filter_sql='organization_id=$1 and lower(name) like $2 and ($3->>''active'' is null or active=($3->>''active'')::boolean)';ordering='sort_order,name,id';
 elsif p_entity='lead_activities' then filter_sql='organization_id=$1 and lead_id=($3->>''lead_id'')::uuid and ($2 is not null)';ordering='occurred_at desc,id';
 elsif p_entity in ('lead_followups','site_visits') then
  filter_sql='organization_id=$1 and ($2 is not null) and ($3->>''lead_id'' is null or lead_id=($3->>''lead_id'')::uuid) and ($3->>''assigned_to'' is null or assigned_to=($3->>''assigned_to'')::uuid) and ($3->>''status'' is null or status=$3->>''status'')';
  ordering=case when p_entity='lead_followups' then 'due_at' else 'scheduled_at' end;
  filter_sql=filter_sql||format(' and ($3->>''queue'' is null or ($3->>''queue''=''overdue'' and %1$I<now()) or ($3->>''queue''=''today'' and (%1$I at time zone ($3->>''timezone''))::date=(now() at time zone ($3->>''timezone''))::date) or ($3->>''queue''=''upcoming'' and (%1$I at time zone ($3->>''timezone''))::date>(now() at time zone ($3->>''timezone''))::date))',ordering);
  if p_entity='lead_followups' then filter_sql=filter_sql||' and ($3->>''type'' is null or followup_type=$3->>''type'')';end if;
  ordering=ordering||',id';p_filter=p_filter||jsonb_build_object('timezone',zone);
 else raise exception 'Invalid entity' using errcode='22023';end if;
 execute format('select count(*) from public.%I where %s',p_entity,filter_sql) into total using org,q,p_filter;
 execute format('select coalesce(jsonb_agg(x),''[]'') from (select %s from public.%I t where %s order by %s limit 25 offset $4)x',projection,p_entity,filter_sql,ordering) into rows using org,q,p_filter,(p_page-1)*25;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end$$;
create or replace function public.lead_quotation_summary(
 p_organization_id uuid, p_lead_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(private.has_permission(p_organization_id,'lead.view'), false)
     or not coalesce(private.has_permission(p_organization_id,'quotation.view'), false) then
    raise exception 'Not authorized to view lead quotations' using errcode='42501';
  end if;
  if coalesce(array_length(p_lead_ids,1),0)>100 then
    raise exception 'Too many leads';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',l.lead_id,'revision_id',r.id,'status',r.status,
    'quotation_number',q.quotation_number,
    'amount',coalesce(r.totals->>'final_amount','0'),
    'shared',exists(select 1 from public.quotation_share_links sh
       where sh.organization_id=l.organization_id and sh.revision_id=r.id
         and sh.revoked_at is null and (sh.expires_at is null or sh.expires_at>now()))
  )),'[]'::jsonb) into result
  from private.lead_quotation_links l
  join public.leads lead
    on lead.id=l.lead_id and lead.organization_id=p_organization_id
  join public.quotations q
    on q.id=l.quotation_id and q.organization_id=l.organization_id
  join public.quotation_revisions r
    on r.id=q.current_revision_id and r.organization_id=q.organization_id
  where l.organization_id=p_organization_id and l.lead_id=any(p_lead_ids);
  return result;
end; $$;
create or replace function public.lead_quotation_list(
 p_organization_id uuid, p_lead_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $
declare result jsonb;
begin
  if not coalesce(private.has_permission(p_organization_id,'lead.view'), false)
     or not coalesce(private.has_permission(p_organization_id,'quotation.view'), false)
     or not exists (
       select 1 from public.leads
       where organization_id=p_organization_id and id=p_lead_id
     ) then
    raise exception 'Not authorized to view lead quotations' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'quotation_id',q.id,
    'quotation_number',q.quotation_number,
    'revision_id',r.id,
    'status',r.status,
    'response',coalesce(resp.action,'not_responded'),
    'project_id',q.project_id,
    'amount',coalesce(r.totals->>'final_amount','0'),
    'shared',exists(select 1 from public.quotation_share_links sh
      where sh.organization_id=l.organization_id and sh.revision_id=r.id
        and sh.revoked_at is null and (sh.expires_at is null or sh.expires_at>now()))
  ) order by l.created_at desc),'[]'::jsonb)
  into result
  from private.lead_quotation_links l
  join public.quotations q
    on q.id=l.quotation_id and q.organization_id=l.organization_id
  join public.quotation_revisions r
    on r.id=q.current_revision_id and r.organization_id=q.organization_id
  left join public.quotation_customer_responses resp
    on resp.revision_id=r.id and resp.organization_id=q.organization_id
  where l.organization_id=p_organization_id and l.lead_id=p_lead_id;
  return result;
end; $;
create or replace function public.crm_lead_log_update(
 p_organization_id uuid,p_lead_id uuid,p_activity_type text,
 p_outcome text,p_note text,p_follow_up_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=''
as $lead_update$
declare
 v_lead public.leads;
 v_activity uuid;
 v_followup_assignee uuid;
 v_body text;
begin
 perform private.crm_require(p_organization_id,'crm.activity.create');
 select * into v_lead from public.leads
  where organization_id=p_organization_id and id=p_lead_id
    and lifecycle<>'archived' for update;
 if not found then raise exception 'Lead unavailable' using errcode='42501';end if;
 if p_activity_type not in ('note','phone_call','meeting','whatsapp_note','email_note')
    or length(trim(coalesce(p_outcome,''))) not between 1 and 200
    or length(coalesce(p_note,''))>3000 then
   raise exception 'Invalid contact update' using errcode='22023';
 end if;
 v_body=trim(concat_ws(' — ',nullif(trim(p_outcome),''),nullif(trim(p_note),'')));
 select public.crm_save(p_organization_id,'lead_activities',jsonb_build_object(
   'lead_id',p_lead_id,'activity_type',p_activity_type,
   'subject',trim(p_outcome),'body',v_body
 )) into v_activity;
 if p_follow_up_at is not null then
   perform private.crm_require(p_organization_id,'crm.followup.manage');
   if p_follow_up_at <= now() then
     raise exception 'Follow-up must be in the future' using errcode='22023';
   end if;
   v_followup_assignee=coalesce(v_lead.assigned_to,auth.uid());
   perform public.crm_save(p_organization_id,'lead_followups',jsonb_build_object(
     'lead_id',p_lead_id,'assigned_to',v_followup_assignee,
     'due_at',p_follow_up_at,'followup_type','call',
     'note',left(v_body,3000)
   ));
 end if;
 return v_activity;
end;
$lead_update$;
revoke all on function public.crm_lead_log_update(uuid,uuid,text,text,text,timestamptz)
 from public,anon;
grant execute on function public.crm_lead_log_update(uuid,uuid,text,text,text,timestamptz)
 to authenticated;
commit;
