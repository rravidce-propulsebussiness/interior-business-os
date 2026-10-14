-- Construction OS Phase 7: shareable, explicitly published customer progress.
-- Anonymous access receives ONLY a bounded customer-safe projection.
begin;

create table private.construction_client_shares(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null check(isfinite(expires_at)),
 revoked_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index construction_client_shares_project on
 private.construction_client_shares(organization_id,project_id,created_at desc);

create table private.construction_client_publications(
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 report_id uuid not null references private.site_reports(id),
 decision text not null check(decision in ('publish','unpublish')),
 published_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,project_id)
   references public.projects(organization_id,id)
);
create index construction_client_report_latest on
 private.construction_client_publications(organization_id,project_id,report_id,sequence desc);

create table private.construction_client_view_limits(
 share_id uuid not null references private.construction_client_shares(id),
 bucket timestamptz not null,
 hits integer not null check(hits between 1 and 100000),
 primary key(share_id,bucket)
);
create index construction_client_limit_age on private.construction_client_view_limits(bucket);

do $$
declare t text;
begin
 foreach t in array array[
   'construction_client_shares','construction_client_publications',
   'construction_client_view_limits'
 ] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end$$;
create trigger construction_client_publication_immutable
 before update or delete on private.construction_client_publications
 for each row execute function private.ops_immutable();

-- A copied client link is a scoped bearer capability; the token itself is
-- returned once, hashed at rest, and cannot perform any write operation.
create function public.construction_client_manage(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare token text;share_id uuid;expiry timestamptz;
 v_report_id uuid;decision text;record_id uuid;
begin
 if not coalesce(private.construction_can_manage(p_org,p_project),false)
 then raise exception 'Project manager required' using errcode='42501';end if;
 if p_action not in ('share_create','share_revoke','report_publish','report_unpublish')
    or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>2000
 then raise exception 'Invalid client sharing command' using errcode='22023';end if;
 perform 1 from public.projects p
  where p.organization_id=p_org and p.id=p_project
   and p.status in ('active','completed') for update;
 if not found then raise exception 'Project unavailable' using errcode='42501';end if;

 if p_action='share_create' then
   if p_input-array['expires_at']<>'{}'::jsonb
     then raise exception 'Unexpected share fields' using errcode='22023';end if;
   expiry=coalesce(nullif(p_input->>'expires_at','')::timestamptz,
     clock_timestamp()+interval '30 days');
   if expiry<=clock_timestamp()+interval '10 minutes'
     or expiry>clock_timestamp()+interval '60 days'
   then raise exception 'Share expiry must be between ten minutes and sixty days'
      using errcode='22023';end if;
   update private.construction_client_shares set revoked_at=clock_timestamp()
     where organization_id=p_org and project_id=p_project and revoked_at is null;
   token=encode(extensions.gen_random_bytes(32),'hex');
   insert into private.construction_client_shares(
     organization_id,project_id,token_hash,expires_at,created_by
   ) values(p_org,p_project,
      encode(extensions.digest(token,'sha256'),'hex'),expiry,auth.uid())
   returning id into share_id;
   perform private.site_log(p_org,p_project,'construction.client.share_created',share_id);
   return jsonb_build_object('share_id',share_id,'token',token,'expires_at',expiry);
 elsif p_action='share_revoke' then
   if p_input-array['share_id']<>'{}'::jsonb
   then raise exception 'Unexpected revocation fields' using errcode='22023';end if;
   update private.construction_client_shares set revoked_at=coalesce(revoked_at,clock_timestamp())
    where organization_id=p_org and project_id=p_project
     and id=(p_input->>'share_id')::uuid returning id into share_id;
   if share_id is null then raise exception 'Share not found' using errcode='42501';end if;
   perform private.site_log(p_org,p_project,'construction.client.share_revoked',share_id);
   return jsonb_build_object('share_id',share_id);
 end if;

 if p_input-array['report_id']<>'{}'::jsonb
 then raise exception 'Unexpected report fields' using errcode='22023';end if;
 v_report_id=(p_input->>'report_id')::uuid;
 if not exists(select 1 from private.site_reports r
    where r.organization_id=p_org and r.project_id=p_project and r.id=v_report_id)
 then raise exception 'Report does not belong to this project' using errcode='42501';end if;
 decision=case when p_action='report_publish' then 'publish' else 'unpublish' end;
 if decision='publish' and not exists(
    select 1 from private.site_report_reviews r
    where r.organization_id=p_org and r.project_id=p_project
      and r.report_id=v_report_id and r.decision='approved'
      and r.id=(
        select later.id from private.site_report_reviews later
        where later.organization_id=p_org and later.project_id=p_project
           and later.report_id=v_report_id
        order by later.created_at desc,later.id desc limit 1)
 ) then raise exception 'Latest manager review must approve report before publication'
   using errcode='23514';end if;
 insert into private.construction_client_publications(
   organization_id,project_id,report_id,decision,published_by)
 values(p_org,p_project,v_report_id,decision,auth.uid()) returning id into record_id;
 perform private.site_log(p_org,p_project,'construction.client.report_'||decision,record_id);
 return jsonb_build_object('event_id',record_id);
end$$;

create function public.construction_client_manage_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.construction_can_manage(p_org,p_project),false)
 then raise exception 'Project manager required' using errcode='42501';end if;
 return jsonb_build_object(
  'shares',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'expires_at',s.expires_at,'revoked_at',s.revoked_at,
    'created_at',s.created_at,'active',s.revoked_at is null
       and s.expires_at>clock_timestamp()) order by s.created_at desc,s.id desc)
     from private.construction_client_shares s where s.organization_id=p_org
       and s.project_id=p_project),'[]'::jsonb),
  'reports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'report_date',r.report_date,
      'completed_work',r.completed_work,'tomorrow_plan',r.tomorrow_plan,
      'approved',coalesce((
        select review.decision='approved' from private.site_report_reviews review
        where review.organization_id=p_org and review.project_id=p_project
          and review.report_id=r.id
        order by review.created_at desc,review.id desc limit 1),false),
      'published',coalesce((
        select e.decision='publish' from private.construction_client_publications e
        where e.organization_id=p_org and e.project_id=p_project
           and e.report_id=r.id order by e.sequence desc limit 1),false))
     order by r.report_date desc,r.created_at desc,r.id desc)
   from private.site_reports r
   where r.organization_id=p_org and r.project_id=p_project
     and r.id in (select candidate.id from private.site_reports candidate
       where candidate.organization_id=p_org and candidate.project_id=p_project
       order by candidate.report_date desc,candidate.created_at desc,candidate.id desc
       limit 40)),'[]'::jsonb)
 );
end$$;

-- Anonymous call: validate bearer token and read ONLY explicit safe fields.
-- Never emit internal notes, documents, finances, curing observations, people,
-- staff roles, inspections, customer contact or unpublished engineer work.
create function public.construction_client_view(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.construction_client_shares;view_hits integer;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
   raise exception 'Project updates unavailable' using errcode='42501';end if;
 select * into s from private.construction_client_shares link
   where link.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if s.id is null then raise exception 'Project updates unavailable'
   using errcode='42501';end if;
 -- Lock project before rechecking expiry/revocation to serialize with manager.
 perform 1 from public.projects p where p.organization_id=s.organization_id
  and p.id=s.project_id for update;
 select * into s from private.construction_client_shares link
   where link.id=s.id and link.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if s.id is null or s.revoked_at is not null or s.expires_at<=clock_timestamp()
   or not coalesce(private.entitled(s.organization_id,'projects'),false)
   or not exists(select 1 from public.projects p
      where p.id=s.project_id and p.organization_id=s.organization_id
        and p.status in ('active','completed'))
 then raise exception 'Project updates unavailable' using errcode='42501';end if;

 delete from private.construction_client_view_limits
   where bucket<date_trunc('minute',clock_timestamp())-interval '3 minutes';
 insert into private.construction_client_view_limits(share_id,bucket,hits)
   values(s.id,date_trunc('minute',clock_timestamp()),1)
   on conflict(share_id,bucket)
     do update set hits=private.construction_client_view_limits.hits+1
   returning hits into view_hits;
 if view_hits>50 then raise exception 'Request rate exceeded' using errcode='54000';end if;

 return jsonb_build_object(
   'project',(
     select jsonb_build_object('name',p.name,'code',p.code)
       from public.projects p where p.organization_id=s.organization_id
         and p.id=s.project_id),
   'stages',coalesce((
     select jsonb_agg(jsonb_build_object(
       'title',st.title,'floor',st.floor_code,'phase',st.phase,
       'certified',private.construction_stage_current(s.organization_id,s.project_id,st.id))
       order by st.sequence)
     from private.construction_project_stages st
     where st.organization_id=s.organization_id and st.project_id=s.project_id
   ),'[]'::jsonb),
   'updates',coalesce((
     select jsonb_agg(jsonb_build_object(
       'date',r.report_date,'completed',r.completed_work,
       'tomorrow',r.tomorrow_plan) order by r.report_date desc,r.created_at desc,r.id desc)
     from private.site_reports r
     where r.organization_id=s.organization_id and r.project_id=s.project_id
      and exists(select 1 from private.construction_client_publications publication
        where publication.organization_id=s.organization_id
          and publication.project_id=s.project_id
          and publication.report_id=r.id and publication.decision='publish'
          and publication.sequence=(
            select max(recent.sequence) from private.construction_client_publications recent
            where recent.organization_id=s.organization_id
              and recent.project_id=s.project_id and recent.report_id=r.id))
      and exists(select 1 from private.site_report_reviews review
        where review.organization_id=s.organization_id and review.project_id=s.project_id
          and review.report_id=r.id and review.decision='approved'
          and review.id=(select latest.id from private.site_report_reviews latest
             where latest.organization_id=s.organization_id and latest.project_id=s.project_id
              and latest.report_id=r.id
             order by latest.created_at desc,latest.id desc limit 1))
      and r.id in (select id from private.site_reports scope
        where scope.organization_id=s.organization_id and scope.project_id=s.project_id
        order by scope.report_date desc,scope.created_at desc,scope.id desc limit 40)
   ),'[]'::jsonb),
   'as_of',clock_timestamp()
 );
end$$;

revoke all on function public.construction_client_manage(uuid,uuid,text,jsonb),
 public.construction_client_manage_read(uuid,uuid),
 public.construction_client_view(text)
 from public,anon,authenticated;
grant execute on function public.construction_client_manage(uuid,uuid,text,jsonb),
 public.construction_client_manage_read(uuid,uuid) to authenticated;
grant execute on function public.construction_client_view(text) to anon,authenticated;
commit;
