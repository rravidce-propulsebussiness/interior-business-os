-- Platform company control: one canonical organization for buyers and sellers.
-- No Auth accounts are fabricated: owners must already be email-verified users.
begin;

create function public.platform_company_create(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_owner uuid; v_owner_email text;
 v_id uuid; v_member uuid; v_role uuid; v_seller_id uuid;
 v_name text; v_slug text; v_country text; v_currency text; v_timezone text;
 v_legal text; v_store text; v_plan uuid; v_industry_keys text[];
 v_seller boolean; template record;
begin
 perform private.require_platform('platform.organizations.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>5000
  or (p_input-array['name','slug','legalName','ownerEmail','country','currency','timezone','planId','industries','seller','storeName'])<>'{}'::jsonb
 then raise exception 'Invalid company payload' using errcode='22023'; end if;
 v_name=btrim(coalesce(p_input->>'name',''));
 v_slug=btrim(coalesce(p_input->>'slug',''));
 v_owner_email=lower(btrim(coalesce(p_input->>'ownerEmail','')));
 v_legal=nullif(btrim(coalesce(p_input->>'legalName','')),'');
 v_country=coalesce(p_input->>'country','');
 v_currency=coalesce(p_input->>'currency','');
 v_timezone=coalesce(p_input->>'timezone','');
 v_seller=coalesce((p_input->>'seller')::boolean,false);
 v_store=btrim(coalesce(p_input->>'storeName',''));
 if length(v_name) not between 2 and 200 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  or length(v_slug)>80 or length(v_owner_email)>254 or length(v_owner_email)<5
  or v_country !~ '^[A-Z]{2}$' or v_currency !~ '^[A-Z]{3}$'
  or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone)
  or length(coalesce(v_legal,''))>200
  or (v_seller and length(coalesce(nullif(v_store,''),v_name)) not between 2 and 150)
  or (p_input ? 'seller' and jsonb_typeof(p_input->'seller')<>'boolean')
 then raise exception 'Invalid company fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'industries') is distinct from 'array'
  or jsonb_array_length(p_input->'industries') not between 1 and 12
 then raise exception 'Select at least one active industry' using errcode='22023'; end if;
 select array_agg(distinct key order by key) into v_industry_keys
   from jsonb_array_elements_text(p_input->'industries') as t(key);
 if cardinality(v_industry_keys)<>jsonb_array_length(p_input->'industries')
  or exists(select 1 from unnest(v_industry_keys) as x(key)
    where not exists(select 1 from public.industries i where i.key=x.key and i.status='active'))
 then raise exception 'Invalid or duplicate industry' using errcode='22023';end if;
 select u.id into v_owner
 from auth.users u join public.profiles p on p.id=u.id
 where lower(u.email)=v_owner_email and u.email_confirmed_at is not null
  and p.status='active';
 if v_owner is null then
   raise exception 'Existing verified active owner account required' using errcode='22023';end if;
 if exists(select 1 from public.organizations where slug=v_slug) then
   raise exception 'Company slug already registered' using errcode='23505';end if;
 if nullif(p_input->>'planId','') is not null then
   v_plan=(p_input->>'planId')::uuid;
   if not exists(select 1 from public.plans where id=v_plan and status='active') then
     raise exception 'Unavailable company plan' using errcode='22023';end if;
 else
   select d.plan_id into v_plan from private.provisioning_defaults d
    join public.plans p on p.id=d.plan_id where p.status='active' limit 1;
 end if;
 insert into public.organizations(name,slug,legal_name,status,country_code,
   default_currency,default_timezone,created_by,plan_id)
 values(v_name,v_slug,v_legal,'active',v_country,v_currency,v_timezone,v_owner,v_plan)
 returning id into v_id;
 insert into public.organization_memberships(organization_id,user_id,status)
 values(v_id,v_owner,'active') returning id into v_member;
 for template in select * from private.role_templates order by key loop
  insert into public.roles(organization_id,key,name,is_owner)
  values(v_id,template.key,template.name,template.is_owner) returning id into v_role;
  insert into public.role_permissions(organization_id,role_id,permission_id)
   select v_id,v_role,p.id from private.role_template_permissions t
   join public.permissions p on p.key=t.permission_key
   where t.role_key=template.key and p.scope='organization';
  if template.is_owner then
    insert into public.membership_roles(organization_id,membership_id,role_id)
    values(v_id,v_member,v_role);
  end if;
 end loop;
 insert into public.organization_industries(organization_id,industry_id)
 select v_id,i.id from public.industries i where i.status='active'
   and i.key=any(v_industry_keys);
 if (select count(*) from public.organization_industries where organization_id=v_id)
   <>cardinality(v_industry_keys) then raise exception 'Industry was modified' using errcode='22023';end if;
 perform private.assert_owner(v_id);
 if v_seller then
   insert into private.marketplace_sellers(organization_id,display_name,status,applied_by,reviewed_by)
   values(v_id,coalesce(nullif(v_store,''),v_name),'approved',v_owner,auth.uid())
   returning id into v_seller_id;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),v_id,'platform.company.created','organization',v_id::text,
   jsonb_build_object('owner',v_owner,'industries',v_industry_keys,'seller',v_seller));
 return jsonb_build_object('organizationId',v_id,'sellerId',v_seller_id);
end $fn$;

create function public.platform_company_directory(
 p_query text default null,p_status text default null,p_industry_id uuid default null,
 p_kind text default 'all',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb;v_total bigint;
begin
 perform private.require_platform('platform.organizations.view');
 if length(coalesce(p_query,''))>80
  or (p_status is not null and p_status not in ('active','trial','suspended','archived'))
  or p_kind not in ('all','seller','business','pending')
  or p_page not between 1 and 10000
 then raise exception 'Invalid directory search' using errcode='22023';end if;
 with matches as (
  select o.*,s.id seller_id,s.display_name seller_name,s.status seller_status
  from public.organizations o
  left join private.marketplace_sellers s on s.organization_id=o.id
  where (p_status is null or o.status=p_status)
   and (p_kind='all'
     or (p_kind='seller' and s.status='approved')
     or (p_kind='pending' and s.status='pending')
     or (p_kind='business' and s.id is null))
   and (p_industry_id is null or exists(
    select 1 from public.organization_industries oi
    where oi.organization_id=o.id and oi.industry_id=p_industry_id))
   and (nullif(btrim(p_query),'') is null
    or o.name ilike '%'||replace(replace(replace(btrim(p_query),E'\\',''),'%', ''),'_', '')||'%'
    or o.slug ilike '%'||replace(replace(replace(btrim(p_query),E'\\',''),'%', ''),'_', '')||'%')
 )
 select count(*) into v_total from matches;
 with matches as (
  select o.*,s.id seller_id,s.display_name seller_name,s.status seller_status
  from public.organizations o
  left join private.marketplace_sellers s on s.organization_id=o.id
  where (p_status is null or o.status=p_status)
   and (p_kind='all'
     or (p_kind='seller' and s.status='approved')
     or (p_kind='pending' and s.status='pending')
     or (p_kind='business' and s.id is null))
   and (p_industry_id is null or exists(
    select 1 from public.organization_industries oi
    where oi.organization_id=o.id and oi.industry_id=p_industry_id))
   and (nullif(btrim(p_query),'') is null
    or o.name ilike '%'||replace(replace(replace(btrim(p_query),E'\\',''),'%', ''),'_', '')||'%'
    or o.slug ilike '%'||replace(replace(replace(btrim(p_query),E'\\',''),'%', ''),'_', '')||'%')
 )
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from (
   select o.id,o.name,o.slug,o.status,o.plan_id as "planId",o.country_code as "country",
     o.created_at as "createdAt",o.seller_id as "sellerId",
     o.seller_name as "sellerName",o.seller_status as "sellerStatus",
     coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'key',i.key,'name',i.name) order by i.name)
       from public.organization_industries oi join public.industries i on i.id=oi.industry_id
       where oi.organization_id=o.id),'[]'::jsonb) as industries,
     (select count(*)::integer from public.organization_memberships m
      where m.organization_id=o.id and m.status='active') as "memberCount"
   from matches o order by o.created_at desc,o.id desc
   limit 20 offset (p_page-1)*20
 ) r;
 return jsonb_build_object('rows',v_rows,'total',v_total,'page',p_page);
end $fn$;

create function public.platform_company_profile(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_result jsonb;
begin
 perform private.require_platform('platform.organizations.view');
 select jsonb_build_object(
  'ownerEmail',(select u.email from auth.users u where u.id=o.created_by),
  'industries',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'key',i.key,'name',i.name)
   order by i.name) from public.organization_industries oi
    join public.industries i on i.id=oi.industry_id
    where oi.organization_id=o.id),'[]'::jsonb),
  'seller',(select jsonb_build_object('id',s.id,'name',s.display_name,'status',s.status)
    from private.marketplace_sellers s where s.organization_id=o.id),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'key',r.key,'name',r.name,
    'isOwner',r.is_owner) order by r.is_owner desc,r.name)
    from public.roles r where r.organization_id=o.id),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'email',u.email,
    'status',m.status,'roleIds',coalesce((select jsonb_agg(mr.role_id order by mr.role_id)
     from public.membership_roles mr where mr.membership_id=m.id and mr.branch_id is null),'[]'::jsonb))
     order by m.created_at) from public.organization_memberships m
     join auth.users u on u.id=m.user_id where m.organization_id=o.id),'[]'::jsonb)
 ) into v_result from public.organizations o where o.id=p_organization_id;
 if v_result is null then raise exception 'Company unavailable' using errcode='42501'; end if;
 return v_result;
end $fn$;

create function public.platform_company_seller_enable(p_organization_id uuid,p_store_name text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_owner uuid;v_name text=btrim(coalesce(p_store_name,''));
begin
 perform private.require_platform('platform.organizations.manage');
 if length(v_name) not between 2 and 150 then
  raise exception 'Store name is required' using errcode='22023';end if;
 select o.created_by into v_owner from public.organizations o
 where o.id=p_organization_id and o.status in ('active','trial') for update;
 if v_owner is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=v_owner and u.email_confirmed_at is not null and p.status='active') then
   raise exception 'Active company and verified owner required' using errcode='22023';end if;
 if exists(select 1 from private.marketplace_sellers where organization_id=p_organization_id) then
  raise exception 'Seller already registered; use marketplace review to change status' using errcode='23505';end if;
 insert into private.marketplace_sellers(organization_id,display_name,status,applied_by,reviewed_by)
 values(p_organization_id,v_name,'approved',v_owner,auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'platform.seller.created','marketplace_seller',v_id::text);
 return v_id;
end $fn$;

create function public.platform_company_industry_set(p_organization_id uuid,p_industry_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_count integer;
begin
 perform private.require_platform('platform.organizations.manage');
 if p_enabled is null then raise exception 'Invalid industry operation' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization_id and status<>'archived' for update;
 if not found or not exists(select 1 from public.industries where id=p_industry_id and status='active')
 then raise exception 'Active company and industry required' using errcode='22023';end if;
 if p_enabled then
   insert into public.organization_industries(organization_id,industry_id)
   values(p_organization_id,p_industry_id) on conflict do nothing;
 else
   if exists(select 1 from private.marketplace_products p
     join private.marketplace_sellers s on s.id=p.seller_id
     where s.organization_id=p_organization_id and p.industry_id=p_industry_id
       and p.status='published') then
     raise exception 'Archive published seller listings in this industry first' using errcode='22023';end if;
   select count(*) into v_count from public.organization_industries
    where organization_id=p_organization_id;
   if v_count<=1 then raise exception 'Company must retain an industry' using errcode='22023';end if;
   delete from public.organization_industries where organization_id=p_organization_id and industry_id=p_industry_id;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,case when p_enabled then 'platform.company.industry.added' else 'platform.company.industry.removed' end,
 'industry',p_industry_id::text);
end $fn$;

create function public.platform_company_role_set(
 p_organization_id uuid,p_membership_id uuid,p_role_id uuid,p_remove boolean)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_role public.roles;
begin
 perform private.require_platform('platform.organizations.manage');
 perform private.require_platform('platform.roles.manage');
 if p_remove is null then raise exception 'Invalid role change' using errcode='22023';end if;
 perform 1 from public.organizations where id=p_organization_id for update;
 if not found then raise exception 'Company unavailable' using errcode='42501'; end if;
 select * into v_role from public.roles where id=p_role_id and organization_id=p_organization_id;
 if not found or not exists (select 1 from public.organization_memberships
   where id=p_membership_id and organization_id=p_organization_id and status='active')
 then raise exception 'Active membership and same-company role required' using errcode='42501';end if;
 if p_remove then
   delete from public.membership_roles where organization_id=p_organization_id
     and membership_id=p_membership_id and role_id=p_role_id and branch_id is null;
 else
   insert into public.membership_roles(organization_id,membership_id,role_id,branch_id)
   values(p_organization_id,p_membership_id,p_role_id,null) on conflict do nothing;
 end if;
 perform private.assert_owner(p_organization_id);
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_organization_id,case when p_remove then 'platform.company.role.removed' else 'platform.company.role.assigned' end,
 'membership',p_membership_id::text,jsonb_build_object('roleId',p_role_id));
end $fn$;

revoke all on function
 public.platform_company_create(jsonb),
 public.platform_company_directory(text,text,uuid,text,integer),
 public.platform_company_profile(uuid),
 public.platform_company_seller_enable(uuid,text),
 public.platform_company_industry_set(uuid,uuid,boolean),
 public.platform_company_role_set(uuid,uuid,uuid,boolean)
 from public,anon;
grant execute on function
 public.platform_company_create(jsonb),
 public.platform_company_directory(text,text,uuid,text,integer),
 public.platform_company_profile(uuid),
 public.platform_company_seller_enable(uuid,text),
 public.platform_company_industry_set(uuid,uuid,boolean),
 public.platform_company_role_set(uuid,uuid,uuid,boolean)
 to authenticated;

commit;
