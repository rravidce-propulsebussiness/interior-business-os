-- Unified Super Admin users and tenant owners/sellers directory.
-- No fabricated Auth users and no duplicate organization/member entities.
begin;

create function private.platform_user_kind(p_id uuid)
returns text language sql stable security definer set search_path='' as $fn$
 select case
   when exists(
     select 1 from public.organization_memberships m
     join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id and mr.branch_id is null
     join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
     where m.user_id=p_id and m.status='active' and not exists(
       select 1 from private.marketplace_sellers s where s.organization_id=m.organization_id and s.status='approved'
     )
   ) then 'business_owner'
   when exists(
     select 1 from public.organization_memberships m
     join private.marketplace_sellers s on s.organization_id=m.organization_id and s.status='approved'
     where m.user_id=p_id and m.status='active'
   ) then 'seller'
   when exists(
     select 1 from public.organization_memberships m
     join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id and mr.branch_id is null
     join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
     where m.user_id=p_id and m.status='active'
   ) then 'business_owner'
   else 'general_user'
 end
$fn$;

create function private.platform_user_card(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'id',u.id,'email',u.email,'phone',coalesce(u.phone,''),
  'name',coalesce(nullif(trim(p.full_name),''),split_part(u.email,'@',1)),
  'avatar',coalesce(p.avatar_url,''),
  'status',case when u.email_confirmed_at is null then 'pending'
    when p.status='suspended' then 'suspended' else 'active' end,
  'kind',private.platform_user_kind(u.id),
  'verified',u.email_confirmed_at is not null,
  'createdAt',u.created_at,
  'companies',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',o.id,'name',o.name,'slug',o.slug,'status',o.status,
      'membershipId',m.id,'memberStatus',m.status,
      'isOwner',exists(
        select 1 from public.membership_roles mr join public.roles r
          on r.id=mr.role_id and r.organization_id=mr.organization_id
        where mr.membership_id=m.id and mr.organization_id=m.organization_id
          and mr.branch_id is null and r.is_owner
      ),
      'roles',coalesce((
        select jsonb_agg(r.name order by r.name) from public.membership_roles mr
          join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id
        where mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
      ),'[]'::jsonb),
      'sellerStatus',s.status,
      'industries',coalesce((
        select jsonb_agg(i.name order by i.name) from public.organization_industries oi
          join public.industries i on i.id=oi.industry_id
        where oi.organization_id=o.id
      ),'[]'::jsonb)
    ) order by o.name,o.id)
    from public.organization_memberships m
      join public.organizations o on o.id=m.organization_id
      left join private.marketplace_sellers s on s.organization_id=o.id
    where m.user_id=u.id and m.status<>'revoked'
  ),'[]'::jsonb)
 )
 from auth.users u left join public.profiles p on p.id=u.id
 where u.id=p_id
$fn$;

create function public.platform_user_directory(
 p_query text default '',
 p_kind text default 'all',
 p_status text default '',
 p_industry_id uuid default null,
 p_page integer default 1,
 p_sort text default 'newest'
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb;v_count bigint;v_totals jsonb;
begin
 perform private.require_platform('platform.organizations.view');
 if length(coalesce(p_query,''))>80
  or p_kind not in ('all','business_owner','seller','general_user')
  or p_status not in ('','active','pending','suspended')
  or p_page not between 1 and 10000 or p_sort not in ('newest','oldest','name')
 then raise exception 'Invalid user filter' using errcode='22023'; end if;
 with identities as (
   select u.id,u.email,u.created_at,private.platform_user_kind(u.id) kind,
     case when u.email_confirmed_at is null then 'pending'
       when p.status='suspended' then 'suspended' else 'active' end status
   from auth.users u left join public.profiles p on p.id=u.id
 ), matches as (
   select * from identities i
   where (p_kind='all' or i.kind=p_kind)
     and (p_status='' or i.status=p_status)
     and (nullif(trim(p_query),'') is null or
       i.email ilike '%' || replace(replace(replace(trim(p_query),E'\\',''),'%',''),'_','') || '%' or
       exists (select 1 from public.profiles p where p.id=i.id
         and p.full_name ilike '%' || replace(replace(trim(p_query),'%',''),'_','') || '%') or
       exists (select 1 from public.organization_memberships m
         join public.organizations o on o.id=m.organization_id
         where m.user_id=i.id and o.name ilike '%' || replace(replace(trim(p_query),'%',''),'_','') || '%'))
     and (p_industry_id is null or exists(
       select 1 from public.organization_memberships m
       join public.organization_industries oi on oi.organization_id=m.organization_id
       where m.user_id=i.id and oi.industry_id=p_industry_id))
 )
 select count(*) into v_count from matches;
 with matches as (
   select u.id,u.created_at from auth.users u
   left join public.profiles p on p.id=u.id
   where (p_kind='all' or private.platform_user_kind(u.id)=p_kind)
     and (p_status='' or
       case when u.email_confirmed_at is null then 'pending'
       when p.status='suspended' then 'suspended' else 'active' end=p_status)
     and (nullif(trim(p_query),'') is null or
       u.email ilike '%' || replace(replace(replace(trim(p_query),E'\\',''),'%',''),'_','') || '%' or
       p.full_name ilike '%' || replace(replace(trim(p_query),'%',''),'_','') || '%' or
       exists(select 1 from public.organization_memberships m
        join public.organizations o on o.id=m.organization_id
        where m.user_id=u.id and o.name ilike '%' || replace(replace(trim(p_query),'%',''),'_','') || '%'))
     and (p_industry_id is null or exists(
       select 1 from public.organization_memberships m
       join public.organization_industries oi on oi.organization_id=m.organization_id
       where m.user_id=u.id and oi.industry_id=p_industry_id))
 )
 select coalesce(jsonb_agg(private.platform_user_card(x.id)),'[]'::jsonb)
 into v_rows from (
   select id from matches order by
     case when p_sort='name' then lower((select coalesce(nullif(trim(p.full_name),''),u.email) from auth.users u left join public.profiles p on p.id=u.id where u.id=matches.id)) end asc nulls last,
     case when p_sort='oldest' then created_at end asc nulls last,
     case when p_sort='newest' then created_at end desc nulls last,
     id desc
   limit 20 offset (p_page-1)*20
 ) x;

 select jsonb_build_object(
  'organizations',(select count(*) from public.organizations where status<>'archived'),
  'businessOwners',(select count(*) from auth.users u where private.platform_user_kind(u.id)='business_owner'),
  'sellers',(select count(*) from auth.users u where private.platform_user_kind(u.id)='seller'),
  'generalUsers',(select count(*) from auth.users u where private.platform_user_kind(u.id)='general_user'),
  'activeUsers',(select count(*) from auth.users u join public.profiles p on p.id=u.id
    where u.email_confirmed_at is not null and p.status='active'),
  'totalUsers',(select count(*) from auth.users)
 ) into v_totals;
 return jsonb_build_object('rows',v_rows,'total',v_count,'page',p_page,'stats',v_totals);
end $fn$;

create function public.platform_user_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_result jsonb;
begin
 perform private.require_platform('platform.organizations.view');
 select private.platform_user_card(p_user_id) into v_result;
 if v_result is null then raise exception 'Unknown user' using errcode='42501';end if;
 return v_result;
end $fn$;

create function public.platform_user_status_set(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_old text;
begin
 perform private.require_platform('platform.organizations.manage');
 if p_user_id is null or p_user_id=auth.uid() or p_status not in ('active','suspended')
 or exists(select 1 from public.platform_user_roles where user_id=p_user_id)
 or exists(
   select 1 from public.organization_memberships m
   join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
   join public.roles r on r.organization_id=mr.organization_id and r.id=mr.role_id and r.is_owner
   where m.user_id=p_user_id and m.status='active'
 )
 then raise exception 'Platform administrators, yourself and owners cannot be suspended here' using errcode='42501';end if;
 select status into v_old from public.profiles where id=p_user_id for update;
 if v_old is null then raise exception 'Profile does not exist' using errcode='42501';end if;
 if v_old is distinct from p_status then
   update public.profiles set status=p_status,updated_at=now() where id=p_user_id;
   insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
   values(auth.uid(),'platform.user.status.changed','profile',p_user_id::text,
     jsonb_build_object('before',v_old,'after',p_status));
 end if;
end $fn$;

-- Attaches an EXISTING verified identity only. Company owners are provisioned
-- by platform_company_create; this operation cannot silently grant owner.
create function public.platform_user_company_assign(
 p_user_id uuid,p_organization_id uuid,p_role_id uuid
) returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_member uuid;
begin
 perform private.require_platform('platform.organizations.manage');
 perform private.require_platform('platform.roles.manage');
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=p_user_id and u.email_confirmed_at is not null and p.status='active')
  or not exists(select 1 from public.organizations o where o.id=p_organization_id and o.status in ('active','trial'))
  or not exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=p_organization_id and not r.is_owner)
 then raise exception 'Verified user, active company and non-owner role required' using errcode='42501';end if;
 insert into public.organization_memberships(organization_id,user_id,status)
 values(p_organization_id,p_user_id,'active')
 on conflict(organization_id,user_id) do update set status='active'
 returning id into v_member;
 insert into public.membership_roles(organization_id,membership_id,role_id,branch_id)
 values(p_organization_id,v_member,p_role_id,null) on conflict do nothing;
 perform private.assert_owner(p_organization_id);
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_organization_id,'platform.user.attached','membership',v_member::text,
  jsonb_build_object('userId',p_user_id,'roleId',p_role_id));
 return v_member;
end $fn$;

create function public.platform_user_company_choices()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_platform('platform.organizations.manage');
 perform private.require_platform('platform.roles.manage');
 return coalesce((
    select jsonb_agg(jsonb_build_object(
      'organizationId',o.id,'organizationName',o.name,
      'roles',coalesce((
        select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name)
        from public.roles r where r.organization_id=o.id and not r.is_owner
      ),'[]'::jsonb)
    ) order by o.name)
    from (select id,name from public.organizations where status in ('active','trial')
      order by name,id limit 100) o
  ),'[]'::jsonb);
end $fn$;

revoke all on function public.platform_user_directory(text,text,text,uuid,integer,text),
 public.platform_user_profile(uuid), public.platform_user_status_set(uuid,text),
 public.platform_user_company_assign(uuid,uuid,uuid),public.platform_user_company_choices() from public,anon;
grant execute on function public.platform_user_directory(text,text,text,uuid,integer),
 public.platform_user_profile(uuid), public.platform_user_status_set(uuid,text),
 public.platform_user_company_assign(uuid,uuid,uuid),public.platform_user_company_choices() to authenticated;
commit;
