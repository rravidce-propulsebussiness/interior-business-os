-- Organization-first Super Admin onboarding: only verified owners appear
-- in the platform owner directory. Employee accounts remain scoped to tenants.
begin;
create function public.platform_owner_directory(
 p_query text default '',
 p_status text default '',
 p_industry_id uuid default null,
 p_page integer default 1,
 p_sort text default 'newest',
 p_kind text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb;v_total bigint;v_stats jsonb;
begin
 perform private.require_platform('platform.organizations.view');
 if length(coalesce(p_query,''))>80
    or p_status not in ('','active','pending','suspended')
    or p_page not between 1 and 10000
    or p_sort not in ('newest','oldest','name')
    or p_kind not in ('all','business_owner','seller')
 then raise exception 'Invalid owner filter' using errcode='22023';end if;
 with owners as (
  select distinct u.id,u.email,
   coalesce(p.created_at,u.email_confirmed_at) created_at,
   coalesce(nullif(trim(p.full_name),''),u.email) display_name,
   case when u.email_confirmed_at is null then 'pending'
     when p.status='suspended' then 'suspended' else 'active' end owner_status,
   private.platform_user_kind(u.id) owner_kind
  from auth.users u
   join public.profiles p on p.id=u.id
   join public.organization_memberships m on m.user_id=u.id and m.status='active'
   join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id and mr.branch_id is null
   join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
   join public.organizations o on o.id=m.organization_id and o.status<>'archived'
  where
   (p_industry_id is null or exists(
     select 1 from public.organization_industries oi
     where oi.organization_id=o.id and oi.industry_id=p_industry_id))
   and (nullif(trim(p_query),'') is null
     or u.email ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
     or p.full_name ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
     or o.name ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%')
 )
 select count(*) into v_total from owners
 where (p_status='' or owner_status=p_status)
  and (p_kind='all' or owner_kind=p_kind);
 with owners as (
  select distinct u.id,coalesce(p.created_at,u.email_confirmed_at) created_at,
   coalesce(nullif(trim(p.full_name),''),u.email) display_name,
   case when u.email_confirmed_at is null then 'pending'
     when p.status='suspended' then 'suspended' else 'active' end owner_status,
   private.platform_user_kind(u.id) owner_kind
  from auth.users u
   join public.profiles p on p.id=u.id
   join public.organization_memberships m on m.user_id=u.id and m.status='active'
   join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id and mr.branch_id is null
   join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
   join public.organizations o on o.id=m.organization_id and o.status<>'archived'
  where
   (p_industry_id is null or exists(
     select 1 from public.organization_industries oi
     where oi.organization_id=o.id and oi.industry_id=p_industry_id))
   and (nullif(trim(p_query),'') is null
     or u.email ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
     or p.full_name ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%'
     or o.name ilike '%'||replace(replace(trim(p_query),'%',''),'_','')||'%')
 )
 select coalesce(jsonb_agg(private.platform_user_card(z.id) order by z.sort_time desc,z.id desc),'[]'::jsonb)
 into v_rows from (
  select id,created_at as sort_time from owners
  where (p_status='' or owner_status=p_status)
   and (p_kind='all' or owner_kind=p_kind)
  order by
    case when p_sort='name' then lower(display_name) end asc nulls last,
    case when p_sort='oldest' then created_at end asc nulls last,
    case when p_sort='newest' then created_at end desc nulls last,
    id desc
  limit 20 offset (p_page-1)*20
 ) z;
 select jsonb_build_object(
   'organizations',(select count(*) from public.organizations where status<>'archived'),
   'businessOwners',(select count(*) from (
      select distinct m.user_id from public.organization_memberships m
       join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
       join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
       where m.status='active' and private.platform_user_kind(m.user_id)='business_owner'
   ) q),
   'sellers',(select count(*) from (
      select distinct m.user_id from public.organization_memberships m
       join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
       join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
       where m.status='active' and private.platform_user_kind(m.user_id)='seller'
   ) q),
   'generalUsers',0,
   'activeUsers',(select count(distinct m.user_id) from public.organization_memberships m
      join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
      join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
      join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
      join public.profiles p on p.id=u.id and p.status='active'
      where m.status='active'),
   'totalUsers',(select count(distinct m.user_id) from public.organization_memberships m
      join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
      join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
      where m.status='active')
 ) into v_stats;
 return jsonb_build_object('rows',v_rows,'total',v_total,'page',p_page,'stats',v_stats);
end $fn$;
create function public.platform_owner_email_status(p_email text)
returns text language plpgsql stable security definer set search_path='' as $fn$
declare v_email text;v_state text;
begin
 perform private.require_platform('platform.organizations.manage');
 v_email=lower(trim(coalesce(p_email,'')));
 if length(v_email)<5 or length(v_email)>254 then
   raise exception 'Invalid owner email' using errcode='22023';
 end if;
 select case
  when p.status='suspended' then 'suspended'
  when u.email_confirmed_at is null then 'unverified'
  else 'verified'
 end into v_state
 from auth.users u left join public.profiles p on p.id=u.id
 where lower(u.email)=v_email limit 1;
 return coalesce(v_state,'missing');
end $fn$;

revoke all on function public.platform_owner_directory(text,text,uuid,integer,text,text) from public,anon;
revoke all on function public.platform_owner_email_status(text) from public,anon;
grant execute on function public.platform_owner_directory(text,text,uuid,integer,text,text) to authenticated;
grant execute on function public.platform_owner_email_status(text) to authenticated;
commit;
