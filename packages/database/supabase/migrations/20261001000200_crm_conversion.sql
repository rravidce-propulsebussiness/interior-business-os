begin;
create function public.crm_duplicates(p_organization_id uuid,p_phone text,p_email text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare normalized_phone text;normalized_email text;begin
 perform private.crm_require(p_organization_id,'lead.view');
 if length(p_phone)>50 or length(p_email)>254 then raise exception 'Invalid search' using errcode='22023';end if;
 normalized_phone=private.normalize_crm_phone(p_phone);normalized_email=lower(trim(p_email));
 return jsonb_build_object('leads',coalesce((select jsonb_agg(x) from (select id,name,lead_number from public.leads where organization_id=p_organization_id and ((normalized_phone<>'' and phone_normalized=normalized_phone) or (normalized_email<>'' and email_normalized=normalized_email)) order by created_at desc,id limit 10)x),'[]'),'customers',case when private.commercial_access(p_organization_id,'customer.view','customers') then coalesce((select jsonb_agg(x) from (select id,display_name from public.customers where organization_id=p_organization_id and ((normalized_phone<>'' and private.normalize_crm_phone(customers.phone)=normalized_phone) or (normalized_email<>'' and lower(trim(customers.email))=normalized_email)) order by created_at desc,id limit 10)x),'[]') else '[]'::jsonb end);
end$$;
create function public.crm_convert(p_organization_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads;c public.customers;p public.projects;org uuid=p_organization_id;customer uuid;project uuid;begin
 perform 1 from public.organizations where id=org for update;
 perform private.crm_require(org,'lead.convert');
 if not private.commercial_access(org,'customer.view','customers') or not private.commercial_access(org,'project.view','projects') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into l from public.leads where organization_id=org and id=(p_input->>'id')::uuid for update;
 if l.id is null then raise exception 'Unavailable lead' using errcode='42501';end if;
 if l.converted_at is not null then return jsonb_build_object('customer_id',l.converted_customer_id,'project_id',l.converted_project_id);end if;
 if l.lifecycle<>'open' then raise exception 'Open lead required' using errcode='22023';end if;
 if l.version is distinct from (p_input->>'version')::integer then raise exception 'Stale lead' using errcode='40001';end if;
 customer=(p_input->>'customer_id')::uuid;project=(p_input->>'project_id')::uuid;
 if customer is null then
  if not private.commercial_access(org,'customer.create','customers') then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.customers where organization_id=org and ((l.phone_normalized<>'' and private.normalize_crm_phone(phone)=l.phone_normalized) or (l.email_normalized<>'' and lower(trim(email))=l.email_normalized))) and coalesce((p_input->>'acknowledge_duplicate')::boolean,false)=false then raise exception 'Acknowledge possible customer match' using errcode='22023';end if;
  insert into public.customers(organization_id,display_name,legal_name,customer_type,phone,secondary_phone,email) values(org,l.name,l.company_name,case when l.company_name='' then 'individual' else 'business' end,l.phone,l.secondary_phone,l.email) returning id into customer;
 else
  select * into c from public.customers where organization_id=org and id=customer and status='active';
  if c.id is null then raise exception 'Unavailable customer' using errcode='42501';end if;
 end if;
 if project is null then
  if not private.commercial_access(org,'project.create','projects') then raise exception 'Forbidden' using errcode='42501';end if;
  perform private.crm_assignee(org,l.assigned_to,l.branch_id);
  insert into public.projects(organization_id,customer_id,name,code,industry_id,branch_id,project_type,site_address,notes,assigned_user_id) values(org,customer,coalesce(nullif(trim(p_input->>'project_name'),''),l.name),'P-'||replace(l.id::text,'-',''),l.industry_id,l.branch_id,l.service_type,l.site_address,left(l.notes,10000),l.assigned_to) returning id into project;
 else
  select * into p from public.projects where organization_id=org and id=project and customer_id=customer and status='active';
  if p.id is null then raise exception 'Unavailable project' using errcode='42501';end if;
  if exists(select 1 from public.leads where organization_id=org and converted_project_id=project) then raise exception 'Project already attributed' using errcode='40001';end if;
 end if;
 update public.leads set converted_customer_id=customer,converted_project_id=project,converted_at=now(),converted_by=auth.uid(),version=version+1 where id=l.id;
 update public.site_visits set project_id=project,version=version+1 where organization_id=org and lead_id=l.id;
 perform private.crm_event(org,l.id,'conversion','Converted to customer and project',jsonb_build_object('customer_id',customer,'project_id',project));
 perform private.crm_audit(org,'lead.converted','leads',l.id);
 return jsonb_build_object('customer_id',customer,'project_id',project);
end$$;

-- Attribution comes from the converted project. The Phase 3 pricing command remains unchanged.
create function private.crm_quotation_event() returns trigger language plpgsql security definer set search_path='' as $$declare lead uuid;kind text;begin
 select id into lead from public.leads where organization_id=new.organization_id and converted_project_id=new.project_id;
 if lead is null then return new;end if;
 if tg_op='INSERT' then kind=case when new.created_from_revision_id is null then 'quotation_created' else 'revision_created' end;
 elsif new.status='issued' and old.status='draft' then kind='quotation_issued';else return new;end if;
 perform private.crm_event(new.organization_id,lead,kind,replace(kind,'_',' '),jsonb_build_object('revision_id',new.id,'quotation_id',new.quotation_id,'revision_number',new.revision_number));return new;
end$$;
create trigger crm_quotation_event after insert or update on public.quotation_revisions for each row execute function private.crm_quotation_event();

create function public.crm_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid=p_organization_id;filter_sql text;ordering text;rows jsonb;total bigint;q text;zone text;projection text='*';begin
 perform private.crm_require(org,'lead.view');
 if p_page not between 1 and 10000 or jsonb_typeof(p_filter)<>'object' or octet_length(p_filter::text)>4000 then raise exception 'Invalid search' using errcode='22023';end if;
 select default_timezone into zone from public.organizations where id=org;
 q=replace(replace(replace(lower(coalesce(p_filter->>'q','')),'\','\\'),'%','\%'),'_','\_')||'%';
 if p_entity='leads' then
  filter_sql='organization_id=$1 and (lower(name) like $2 or lower(lead_number) like $2 or phone_normalized like $2 or email_normalized like $2) and ($3->>''stage_id'' is null or stage_id=($3->>''stage_id'')::uuid) and ($3->>''assigned_to'' is null or assigned_to=($3->>''assigned_to'')::uuid) and ($3->>''source_id'' is null or source_id=($3->>''source_id'')::uuid) and ($3->>''branch_id'' is null or branch_id=($3->>''branch_id'')::uuid) and ($3->>''priority'' is null or priority=$3->>''priority'') and ($3->>''lifecycle'' is null or lifecycle=$3->>''lifecycle'') and ($3->>''converted'' is null or (converted_at is not null)=($3->>''converted'')::boolean) and ($3->>''from'' is null or created_at>=($3->>''from'')::date) and ($3->>''until'' is null or created_at<($3->>''until'')::date+1) and (coalesce(($3->>''unassigned'')::boolean,false)=false or assigned_to is null) and ($3->>''due'' is null or next_follow_up_at<=now())';
  projection='t.*,(select p.full_name from public.profiles p where p.id=t.assigned_to) assignee_name,(select s.name from public.lead_sources s where s.id=t.source_id) source_name,(select a.body from public.lead_activities a where a.lead_id=t.id order by a.occurred_at desc,a.id limit 1) latest_activity';
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

create function public.crm_assignees(p_organization_id uuid,p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.crm_require(p_organization_id,'lead.view');
 if p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Invalid search' using errcode='22023';end if;
 return coalesce((select jsonb_agg(x) from (select m.user_id,p.full_name,m.branch_id from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.status='active' and p.status='active' and starts_with(lower(p.full_name),lower(p_query)) order by p.full_name,m.user_id limit 25 offset (p_page-1)*25)x),'[]');
end$$;
revoke all on function private.crm_quotation_event() from public,anon,authenticated;
revoke all on function public.crm_duplicates(uuid,text,text),public.crm_convert(uuid,jsonb),public.crm_search(uuid,text,jsonb,integer),public.crm_assignees(uuid,text,integer) from public,anon;
grant execute on function public.crm_duplicates(uuid,text,text),public.crm_convert(uuid,jsonb),public.crm_search(uuid,text,jsonb,integer),public.crm_assignees(uuid,text,integer) to authenticated;
commit;
