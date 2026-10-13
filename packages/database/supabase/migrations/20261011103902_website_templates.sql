begin;

create table public.website_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text not null default '' check (length(description) <= 1000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  document jsonb not null check (octet_length(document::text) <= 1500000),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.website_templates enable row level security;
alter table public.website_templates force row level security;
revoke all on public.website_templates from public, anon, authenticated;
grant select on public.website_templates to authenticated;
create policy website_templates_read on public.website_templates for select to authenticated
using (auth.uid() is not null and (status='published' or private.has_platform_permission('platform.entitlements.manage')));

create function public.website_template_save(p_id uuid, p_version integer, p_name text, p_description text, p_document jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.require_platform('platform.entitlements.manage');
  if p_document->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_document->'pages') is distinct from 'array'
    or p_document->'assets' is distinct from '[]'::jsonb
    or exists(select 1 from jsonb_array_elements(p_document->'content') c where c ? 'sourceId' or c ? 'sourceType')
    or exists(select 1 from jsonb_array_elements(p_document->'forms') f where f->>'enabled'='true')
  then raise exception 'A portable template is required' using errcode='22023'; end if;
  if p_version = 0 then
    insert into public.website_templates(id,name,description,document,created_by)
    values(p_id,btrim(p_name),p_description,p_document,auth.uid()) returning id into target;
  else
    update public.website_templates set name=btrim(p_name),description=p_description,document=p_document,
      status='draft',version=version+1,updated_at=now()
    where id=p_id and version=p_version returning id into target;
    if target is null then raise exception 'Template changed; reload before saving' using errcode='40001'; end if;
  end if;
  return target;
end $$;

create function public.website_template_status(p_id uuid,p_version integer,p_status text,p_proof text default null,p_signature text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare t public.website_templates; proof jsonb; next_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.require_platform('platform.entitlements.manage');
  select * into t from public.website_templates where id=p_id for update;
  if t.id is null or t.version is distinct from p_version then raise exception 'Template changed' using errcode='40001'; end if;
  if p_status not in ('published','archived') or p_status is null then raise exception 'Invalid status' using errcode='22023'; end if;
  if p_status='published' then
    proof=private.website_proof(p_proof,p_signature);
    if proof->>'purpose' is distinct from 'website.template.publish' or proof->>'templateId' is distinct from t.id::text
      or (proof->>'version')::integer is distinct from t.version or proof->'document' is distinct from t.document
    then raise exception 'Invalid template proof' using errcode='42501'; end if;
  end if;
  update public.website_templates set status=p_status,version=version+1,updated_at=now() where id=t.id returning version into next_version;
  return next_version;
end $$;

-- Copy through the existing authoring API in one transaction. Its permission,
-- entitlement, page limit and custom-code checks remain authoritative.
create function public.website_from_template(p_organization_id uuid,p_template_id uuid,p_name text,p_slug text,p_empty_document jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.website_templates; target uuid; section text; next_version integer; doc jsonb;
begin
  perform private.website_require(p_organization_id,'website.manage');
  select * into t from public.website_templates where id=p_template_id and status='published' for share;
  if t.id is null then raise exception 'Template unavailable' using errcode='42501'; end if;
  target=public.website_create(p_organization_id,p_name,p_slug,p_empty_document);
  select version into next_version from public.websites where id=target;
  doc=jsonb_set(t.document,'{settings,name}',to_jsonb(p_name));
  foreach section in array array['theme','css','navigation','footerNavigation','header','footer','pages','forms','content','sections','code','settings'] loop
    if doc->section is distinct from p_empty_document->section then
      next_version=public.website_save(p_organization_id,target,next_version,section,doc->section);
    end if;
  end loop;
  perform private.website_event(p_organization_id,target,'website.template_applied',jsonb_build_object('templateId',t.id,'templateVersion',t.version));
  return target;
end $$;

-- Platform administrators manage domain infrastructure without impersonating a member.
-- Company content/drafts stay behind their existing tenant policies.
create function private.website_domain_require(p_organization_id uuid,p_website_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null
    and private.has_platform_permission('platform.entitlements.manage')
    and private.has_platform_permission('platform.organizations.manage') then
    if not exists(select 1 from public.websites w join public.organizations o on o.id=w.organization_id
      where w.id=p_website_id and w.organization_id=p_organization_id
        and w.status not in ('archived','suspended') and o.status in ('active','trial'))
      or not private.entitled(p_organization_id,'website')
    then raise exception 'Unavailable company website' using errcode='42501';end if;
  else
    perform private.website_require(p_organization_id,'website.domain.manage',p_website_id);
  end if;
end $$;
revoke all on function private.website_domain_require(uuid,uuid) from public,anon,authenticated;
create policy website_domains_platform_read on public.website_domains for select to authenticated
using (auth.uid() is not null and private.has_platform_permission('platform.entitlements.manage')
  and private.has_platform_permission('platform.organizations.manage'));

create or replace function public.website_domain_add(p_organization_id uuid,p_website_id uuid,p_hostname text) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;base text;begin
 perform private.website_domain_require(p_organization_id,p_website_id);
 if not coalesce((private.website_config(p_organization_id)->>'custom_domain')::boolean,false) then raise exception 'Custom domain capability required' using errcode='42501';end if;
 select base_domain into base from public.website_platform_settings where id;
 if p_hostname<>lower(p_hostname) or length(p_hostname)>253 or p_hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or p_hostname ~ '(\.localhost|\.local|\.internal|\.test|\.example)$' or p_hostname=base or p_hostname like '%.'||base then raise exception 'Invalid custom hostname' using errcode='22023';end if;
 if exists(select 1 from public.websites where id=p_website_id and status in ('suspended','archived')) then raise exception 'Unavailable website' using errcode='42501';end if;
 if (select count(*) from public.website_domains where website_id=p_website_id and status<>'removed')>=10 then raise exception 'Domain limit reached' using errcode='23514';end if;
 insert into public.website_domains(organization_id,website_id,hostname,kind) values(p_organization_id,p_website_id,p_hostname,'custom') returning id into target;
 perform private.website_event(p_organization_id,p_website_id,'domain.added',jsonb_build_object('domainId',target));return target;
end$$;
create or replace function public.website_domain_check(p_organization_id uuid,p_domain_id uuid,p_proof text,p_signature text) returns text language plpgsql security definer set search_path='' as $$declare d public.website_domains;proof jsonb;state text;begin
 select * into d from public.website_domains where organization_id=p_organization_id and id=p_domain_id;
 perform private.website_domain_require(p_organization_id,d.website_id);
 if d.id is null or d.kind<>'custom' or d.status in ('removed','suspended') then raise exception 'Unavailable domain' using errcode='42501';end if;
 if not coalesce((private.website_config(p_organization_id)->>'custom_domain')::boolean,false) then raise exception 'Custom domain capability required' using errcode='42501';end if;
 proof=private.website_proof(p_proof,p_signature);
 if proof->>'purpose' is distinct from 'website.domain' or proof->>'organizationId' is distinct from p_organization_id::text or proof->>'domainId' is distinct from d.id::text or proof->>'hostname' is distinct from d.hostname or proof->>'challenge' is distinct from d.challenge then raise exception 'Invalid verification proof' using errcode='42501';end if;
 state=case when proof->>'dns'='true' and proof->>'tls'='true' then 'active' when proof->>'dns'='true' then 'verified' else 'failed' end;
 update public.website_domains set status=state,tls_status=case when proof->>'tls'='true' then 'ready' else 'pending' end,verified_at=case when proof->>'dns'='true' then now() else null end,last_checked_at=now(),failure_reason=case when state='failed' then 'DNS ownership or routing not verified' when state='verified' then 'DNS verified; HTTPS certificate not ready' else '' end,version=version+1 where id=d.id;
 perform private.website_event(p_organization_id,d.website_id,'domain.verified',jsonb_build_object('domainId',d.id,'status',state));return state;
end$$;
create or replace function public.website_domain_remove(p_organization_id uuid,p_domain_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare d public.website_domains;begin
 select * into d from public.website_domains where organization_id=p_organization_id and id=p_domain_id;perform private.website_domain_require(p_organization_id,d.website_id);
 if d.id is null or d.version is distinct from p_version then raise exception 'Stale domain' using errcode='40001';end if;
 update public.website_domains set status='removed',version=version+1 where id=d.id;
 perform private.website_event(p_organization_id,d.website_id,'domain.removed',jsonb_build_object('domainId',d.id));
end$$;

create function public.website_platform_domain_registry(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_platform('platform.organizations.view');
  perform private.require_platform('platform.entitlements.manage');
  perform private.require_platform('platform.organizations.manage');
  if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(x),'[]') from (
    select o.id, o.name, o.slug, o.status,
      (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'status',w.status,
        'domains',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'hostname',d.hostname,'kind',d.kind,'status',d.status,'tls_status',d.tls_status,'challenge',d.challenge,'version',d.version)),'[]')
          from public.website_domains d where d.website_id=w.id and d.status<>'removed')) order by w.created_at),'[]')
       from public.websites w where w.organization_id=o.id and w.status<>'archived') websites
    from public.organizations o order by o.created_at desc,o.id limit 25 offset (p_page-1)*25
  ) x);
end $$;

revoke all on function public.website_template_save(uuid,integer,text,text,jsonb),public.website_template_status(uuid,integer,text,text,text),public.website_from_template(uuid,uuid,text,text,jsonb),public.website_platform_domain_registry(integer) from public,anon;
grant execute on function public.website_template_save(uuid,integer,text,text,jsonb),public.website_template_status(uuid,integer,text,text,text),public.website_from_template(uuid,uuid,text,text,jsonb),public.website_platform_domain_registry(integer) to authenticated;

commit;
