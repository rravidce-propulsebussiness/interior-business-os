begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke create on schema public from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 full_name text not null default '' check (length(full_name) <= 200),
 avatar_url text,
 status text not null default 'active' check(status in ('active','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.industries (
 id uuid primary key default gen_random_uuid(), key text not null unique check(key ~ '^[a-z][a-z0-9_]*$'),
 name text not null, status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.permissions (
 id uuid primary key default gen_random_uuid(), key text not null unique,
 scope text not null check(scope in ('organization','platform')), description text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.modules (
 id uuid primary key default gen_random_uuid(), key text not null unique check(key ~ '^[a-z][a-z0-9_]*$'),
 name text not null, description text not null default '',
 required_permission text not null references public.permissions(key),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.plans (
 id uuid primary key default gen_random_uuid(), key text not null unique,
 name text not null, status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.plan_modules (
 plan_id uuid not null references public.plans(id), module_id uuid not null references public.modules(id),
 primary key(plan_id,module_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80), legal_name text,
 status text not null default 'trial' check(status in ('active','trial','suspended','archived')),
 default_currency text not null check(default_currency ~ '^[A-Z]{3}$'),
 default_timezone text not null default 'UTC', country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 plan_id uuid references public.plans(id), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.branches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(name) between 1 and 200), code text not null check(length(code) between 1 and 50),
 status text not null default 'active' check(status in ('active','inactive')), timezone text,
 unique(organization_id,id), unique(organization_id,code),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id), branch_id uuid,
 status text not null default 'invited' check(status in ('invited','active','suspended','revoked')),
 unique(organization_id,id), unique(organization_id,user_id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index memberships_user_status on public.organization_memberships(user_id,status,organization_id);
create table public.roles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 key text not null check(key ~ '^[a-z][a-z0-9_]*$'), name text not null check(length(name) between 1 and 100),
 is_owner boolean not null default false, unique(organization_id,id), unique(organization_id,key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_owner_role on public.roles(organization_id) where is_owner;
create table public.role_permissions (
 organization_id uuid not null references public.organizations(id), role_id uuid not null,
 permission_id uuid not null references public.permissions(id), primary key(role_id,permission_id),
 foreign key(organization_id,role_id) references public.roles(organization_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index role_permissions_tenant on public.role_permissions(organization_id,role_id);
create table public.membership_roles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 membership_id uuid not null, role_id uuid not null, branch_id uuid,
 foreign key(organization_id,membership_id) references public.organization_memberships(organization_id,id),
 foreign key(organization_id,role_id) references public.roles(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id),
 unique nulls not distinct(membership_id,role_id,branch_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index membership_roles_tenant on public.membership_roles(organization_id,membership_id);
create table public.platform_roles (
 id uuid primary key default gen_random_uuid(), key text not null unique, name text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.platform_role_permissions (
 role_id uuid not null references public.platform_roles(id), permission_id uuid not null references public.permissions(id),
 primary key(role_id,permission_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.platform_user_roles (
 user_id uuid not null references public.profiles(id), role_id uuid not null references public.platform_roles(id),
 primary key(user_id,role_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_industries (
 organization_id uuid not null references public.organizations(id), industry_id uuid not null references public.industries(id),
 primary key(organization_id,industry_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_entitlements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 module_id uuid not null references public.modules(id), enabled boolean not null,
 source text not null check(source in ('addon','promotion','manual')),
 valid_from timestamptz not null default now(), valid_until timestamptz,
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object' and octet_length(configuration::text)<=8192),
 unique(organization_id,module_id,source), check(valid_until is null or valid_until > valid_from),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.profiles(id),
 organization_id uuid references public.organizations(id), action text not null,
 entity_type text not null, entity_id text not null, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index audit_tenant_time on public.audit_logs(organization_id,created_at desc);
create table private.role_templates (
 key text primary key, name text not null, is_owner boolean not null default false
);
create table private.role_template_permissions (
 role_key text not null references private.role_templates(key), permission_key text not null references public.permissions(key),
 primary key(role_key,permission_key)
);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','industries','permissions','modules','plans','plan_modules','organizations','branches','organization_memberships','roles','role_permissions','membership_roles','platform_roles','platform_role_permissions','platform_user_roles','organization_industries','organization_entitlements'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),200)) on conflict(id) do nothing;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();
insert into public.profiles(id,full_name) select id,left(coalesce(raw_user_meta_data->>'full_name',''),200) from auth.users on conflict(id) do nothing;

create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and status='active');
$$;
create function private.is_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 where m.user_id=(select auth.uid()) and m.organization_id=org and m.status='active' and o.status in ('active','trial'));
$$;
create function private.has_permission(org uuid, permission text, branch uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(org) and exists(
 select 1 from public.organization_memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
 join public.role_permissions rp on rp.role_id=mr.role_id and rp.organization_id=mr.organization_id
 join public.permissions p on p.id=rp.permission_id
 where m.user_id=(select auth.uid()) and m.organization_id=org and m.status='active' and p.key=permission and p.scope='organization'
 and (m.branch_id is null or m.branch_id=branch) and (mr.branch_id is null or mr.branch_id=branch)
 and (branch is null or exists(select 1 from public.branches b where b.id=branch and b.organization_id=org and b.status='active')));
$$;
create function private.has_platform_permission(permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.platform_user_roles ur join public.platform_role_permissions rp on rp.role_id=ur.role_id
 join public.permissions p on p.id=rp.permission_id where ur.user_id=(select auth.uid()) and p.key=permission and p.scope='platform');
$$;
create function private.entitled(org uuid, module_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o join public.modules m on m.key=module_key and m.status='active'
 where o.id=org and o.status in ('active','trial')
 and not exists(select 1 from public.organization_entitlements e where e.organization_id=org and e.module_id=m.id and not e.enabled and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now()))
 and (exists(select 1 from public.organization_entitlements e where e.organization_id=org and e.module_id=m.id and e.enabled and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now()))
 or exists(select 1 from public.plan_modules pm join public.plans p on p.id=pm.plan_id where pm.plan_id=o.plan_id and p.status='active' and pm.module_id=m.id)));
$$;
create function public.has_entitlement(p_organization_id uuid,p_module_key text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(p_organization_id) and private.entitled(p_organization_id,p_module_key);
$$;

-- Audit triggers capture only an allowlist of identifiers/status. No tokens, emails or request bodies.
create function private.audit_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; org uuid;
begin
 row_data=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 org=case when tg_table_name='organizations' then (row_data->>'id')::uuid else (row_data->>'organization_id')::uuid end;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),org,tg_table_name||'.'||lower(tg_op),tg_table_name,coalesce(row_data->>'id',row_data->>'user_id',row_data->>'role_id',row_data->>'plan_id','configuration'),
 jsonb_strip_nulls(jsonb_build_object('status',row_data->>'status','enabled',row_data->'enabled','role_id',row_data->>'role_id','permission_id',row_data->>'permission_id','module_id',row_data->>'module_id')));
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['organizations','branches','organization_memberships','roles','role_permissions','membership_roles','organization_industries','organization_entitlements','platform_user_roles','platform_role_permissions','modules','plans','plan_modules'] loop
  execute format('create trigger audit_mutation after insert or update or delete on public.%I for each row execute function private.audit_mutation()',t);
 end loop;
end $$;

create function private.assert_owner(org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.organization_memberships m join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
 join public.roles r on r.id=mr.role_id and r.organization_id=m.organization_id join public.profiles p on p.id=m.user_id
 where m.organization_id=org and m.status='active' and p.status='active' and r.is_owner and mr.branch_id is null and m.branch_id is null)
 then raise exception 'An active owner is required' using errcode='23514'; end if;
end $$;
create function private.guard_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 org=(coalesce(to_jsonb(new),to_jsonb(old))->>case when tg_table_name='organizations' then 'id' else 'organization_id' end)::uuid;
 perform 1 from public.organizations where id=org for update;
 perform private.assert_owner(org);
 return null;
end $$;
create constraint trigger organization_owner after insert on public.organizations deferrable initially deferred for each row execute function private.guard_owner();
create constraint trigger membership_owner after insert or update or delete on public.organization_memberships deferrable initially deferred for each row execute function private.guard_owner();
create constraint trigger assignment_owner after insert or update or delete on public.membership_roles deferrable initially deferred for each row execute function private.guard_owner();
create constraint trigger role_owner after update or delete on public.roles deferrable initially deferred for each row execute function private.guard_owner();

-- All application writes go through checked RPCs. There are deliberately no direct write policies/grants.
do $$ declare t text; begin
 foreach t in array array['profiles','industries','permissions','modules','plans','plan_modules','organizations','branches','organization_memberships','roles','role_permissions','membership_roles','platform_roles','platform_role_permissions','platform_user_roles','organization_industries','organization_entitlements','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profiles_self on public.profiles for select to authenticated using(id=(select auth.uid()) and private.is_active_user());
create policy organizations_read on public.organizations for select to authenticated using(private.is_member(id) or private.has_platform_permission('platform.organizations.view'));
create policy branches_read on public.branches for select to authenticated using(private.has_permission(organization_id,'branch.view',id));
create policy memberships_read on public.organization_memberships for select to authenticated using(private.is_member(organization_id) and (user_id=(select auth.uid()) or private.has_permission(organization_id,'team.view',branch_id)));
create policy roles_read on public.roles for select to authenticated using(private.is_member(organization_id));
create policy role_permissions_read on public.role_permissions for select to authenticated using(private.is_member(organization_id));
create policy assignments_read on public.membership_roles for select to authenticated using(private.has_permission(organization_id,'team.view',branch_id) or exists(select 1 from public.organization_memberships m where m.id=membership_id and m.user_id=(select auth.uid()) and private.is_member(m.organization_id)));
create policy industries_read on public.organization_industries for select to authenticated using(private.is_member(organization_id));
create policy entitlements_read on public.organization_entitlements for select to authenticated using(private.is_member(organization_id) or private.has_platform_permission('platform.entitlements.view'));
create policy audit_read on public.audit_logs for select to authenticated using((organization_id is not null and private.has_permission(organization_id,'organization.audit')) or (organization_id is null and private.has_platform_permission('platform.audit.view')));
do $$ declare t text; begin
 foreach t in array array['industries','permissions','modules','plans','plan_modules'] loop
  execute format('create policy catalog_read on public.%I for select to authenticated using(private.is_active_user())',t);
 end loop;
 foreach t in array array['platform_roles','platform_role_permissions'] loop
  execute format('create policy platform_read on public.%I for select to authenticated using(private.has_platform_permission(''platform.access''))',t);
 end loop;
end $$;
create policy platform_assignments_read on public.platform_user_roles for select to authenticated using(user_id=(select auth.uid()) and private.is_active_user());

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_user(), private.is_member(uuid), private.has_permission(uuid,text,uuid), private.has_platform_permission(text) to authenticated;
revoke all on function public.has_entitlement(uuid,text) from public,anon;
grant execute on function public.has_entitlement(uuid,text) to authenticated;
commit;
