-- One project-scoped client request stream. No company-private finance leaks.
-- Clients must be explicitly invited to this exact project and have verified email.
begin;

create table private.project_client_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 user_id uuid not null,
 kind text not null check(kind in ('question','issue','delay','pooja')),
 details text not null check(length(btrim(details)) between 10 and 2000),
 requested_date date,
 status text not null default 'open'
   check(status in ('open','in_review','accepted','declined','resolved')),
 response text not null default '' check(length(response)<=2000),
 responded_by uuid,
 responded_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index project_client_requests_by_project
 on private.project_client_requests(organization_id,project_id,created_at desc);
alter table private.project_client_requests enable row level security;
alter table private.project_client_requests force row level security;
revoke all on private.project_client_requests from public,anon,authenticated;

create function public.project_client_request_create(
 p_project_id uuid,p_kind text,p_details text,p_requested_date date default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid;
begin
 if (select auth.uid()) is null or not private.client_portal_accessible(p_project_id) then
  raise exception 'Invited client access required' using errcode='42501';
 end if;
 if p_kind not in ('question','issue','delay','pooja') or
    length(btrim(coalesce(p_details,''))) not between 10 and 2000 or
    (p_kind='pooja' and p_requested_date is null) or
    (p_kind not in ('pooja','delay') and p_requested_date is not null)
 then raise exception 'Choose a request type and provide valid details' using errcode='22023'; end if;
 select organization_id into v_org from public.projects where id=p_project_id;
 insert into private.project_client_requests
  (organization_id,project_id,user_id,kind,details,requested_date)
 values(v_org,p_project_id,auth.uid(),p_kind,btrim(p_details),p_requested_date)
 returning id into v_id;
 return v_id;
end; $$;

create function public.project_client_request_list(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_rows jsonb;
begin
 select organization_id into v_org from public.projects where id=p_project_id;
 if v_org is null or
    not (private.client_portal_accessible(p_project_id) or
      private.commercial_access(v_org,'project.view','projects')) then
  raise exception 'Project request access denied' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'kind',r.kind,'details',r.details,
  'requested_date',r.requested_date,'status',r.status,
  'response',r.response,'created_at',r.created_at,'responded_at',r.responded_at
 ) order by r.created_at desc),'[]'::jsonb) into v_rows
 from (select id,kind,details,requested_date,status,response,created_at,responded_at
       from private.project_client_requests
       where organization_id=v_org and project_id=p_project_id
       order by created_at desc limit 100) r;
 return v_rows;
end; $$;

create function public.project_client_request_respond(
 p_org uuid,p_project_id uuid,p_request_id uuid,p_status text,p_response text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or
    not private.commercial_access(p_org,'project.manage','projects') then
  raise exception 'Project management permission required' using errcode='42501'; end if;
 if p_status not in ('in_review','accepted','declined','resolved') or
    length(btrim(coalesce(p_response,''))) not between 2 and 2000 then
  raise exception 'Add a valid status and reply' using errcode='22023'; end if;
 update private.project_client_requests set status=p_status,
   response=btrim(p_response),responded_by=auth.uid(),responded_at=now(),updated_at=now()
 where organization_id=p_org and project_id=p_project_id and id=p_request_id;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
end; $$;

revoke all on function public.project_client_request_create(uuid,text,text,date) from public,anon;
revoke all on function public.project_client_request_list(uuid) from public,anon;
revoke all on function public.project_client_request_respond(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.project_client_request_create(uuid,text,text,date) to authenticated;
grant execute on function public.project_client_request_list(uuid) to authenticated;
grant execute on function public.project_client_request_respond(uuid,uuid,uuid,text,text) to authenticated;
commit;
