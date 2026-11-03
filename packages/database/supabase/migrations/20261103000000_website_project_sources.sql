-- Website Studio v2: one site by default; independently managed source identity.
-- Additive only. Existing site/document/domain/publication records are not changed.
begin;

-- Existing plan and manual entitlement "sites" overrides remain authoritative.
-- A plan or Super Admin can grant a higher cap without changing this function.
create or replace function private.website_config(org uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select
    '{"sites":1,"pages":50,"storage_bytes":52428800,"forms":true,"custom_domain":false,"custom_code":false,"developer_mode":false,"analytics":false,"integrations":false}'::jsonb
    || coalesce((
      select l.configuration
        from public.organizations o
        join public.website_plan_limits l on l.plan_id=o.plan_id
       where o.id=org
    ),'{}'::jsonb)
    || coalesce((
      select e.configuration
        from public.organization_entitlements e
        join public.modules m on m.id=e.module_id
       where e.organization_id=org
         and m.key='website'
         and e.enabled
         and e.valid_from<=now()
         and (e.valid_until is null or e.valid_until>now())
       order by case e.source when 'manual' then 0 when 'addon' then 1 else 2 end,
                e.updated_at desc
       limit 1
    ),'{}'::jsonb);
$$;

create table public.website_project_sources (
  website_id uuid primary key,
  organization_id uuid not null,
  source_kind text not null check(source_kind in ('template','repository')),
  template_key text,
  repository_url text,
  branch_name text not null default 'main' check(length(branch_name) between 1 and 100),
  framework text not null default 'other' check(framework in ('static','react','vite','nextjs','vue','astro','php','python','node','other')),
  deployment_url text,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_source_site_fk foreign key(organization_id,website_id)
    references public.websites(organization_id,id) on delete cascade,
  constraint project_source_kind_check check(
    (source_kind='template' and template_key is not null)
    or
    (source_kind='repository' and repository_url is not null and template_key is null)
  )
);
create index project_sources_tenant on public.website_project_sources(organization_id,website_id);
create trigger touch_updated_at before update on public.website_project_sources
for each row execute function private.touch_updated_at();
alter table public.website_project_sources enable row level security;
alter table public.website_project_sources force row level security;
revoke all on public.website_project_sources from public,anon,authenticated;
grant select on public.website_project_sources to authenticated;
create policy website_project_view on public.website_project_sources
for select to authenticated
using(private.website_access(organization_id,'website.view',website_id));

create function private.website_project_validate(
  kind text, template text, repo text, branch text, stack text, deployed text
) returns void language plpgsql immutable set search_path='' as $$
begin
  if kind is null or kind not in ('template','repository')
     or stack not in ('static','react','vite','nextjs','vue','astro','php','python','node','other')
     or branch is null or length(branch) not between 1 and 100
     or branch !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
     or position('..' in branch)>0
  then
    raise exception 'Invalid website project settings' using errcode='22023';
  end if;
  if kind='template' then
    if template is null or template not in
      ('construction','interiors','real-estate','corporate')
      then
      raise exception 'Invalid template choice' using errcode='22023';
    end if;
  elsif kind='repository' and (template is not null or repo is null) then
    raise exception 'Repository URL required' using errcode='22023';
  end if;
  if repo is not null and (
    length(repo)>350 or
    repo !~ '^https://(github[.]com|gitlab[.]com|bitbucket[.]org)/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+([.]git)?
  if deployed is not null and (
    length(deployed)>500
    or deployed !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+([:]443)?(/[-A-Za-z0-9._~/]*)?$'
    or position('..' in deployed)>0
    or deployed ~* '^https://(localhost|127[.]|10[.]|192[.]168[.]|169[.]254[.])'
  ) then
    raise exception 'Use a public HTTPS deployment URL without credentials or parameters' using errcode='22023';
  end if;
end$$;
revoke all on function private.website_project_validate(text,text,text,text,text,text)
from public,anon,authenticated;

-- Atomic creation: the existing checked website_create function still enforces
-- the plan/manual entitlement site quota and reserves the managed subdomain.
create function public.website_project_create(
  p_organization_id uuid,
  p_name text,
  p_slug text,
  p_document jsonb,
  p_source_kind text,
  p_template_key text default null,
  p_repository_url text default null,
  p_branch_name text default 'main',
  p_framework text default 'other'
) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform private.website_project_validate(
    p_source_kind,p_template_key,p_repository_url,p_branch_name,p_framework,null
  );
  target := public.website_create(p_organization_id,p_name,p_slug,p_document);
  insert into public.website_project_sources (
    website_id,organization_id,source_kind,template_key,repository_url,branch_name,framework
  ) values (
    target,p_organization_id,p_source_kind,p_template_key,p_repository_url,p_branch_name,p_framework
  );
  perform private.website_event(
    p_organization_id,target,'website.project_connected',
    jsonb_build_object('sourceKind',p_source_kind,'framework',p_framework)
  );
  return target;
end$$;

create function public.website_project_configure(
  p_organization_id uuid,
  p_website_id uuid,
  p_version integer,
  p_repository_url text,
  p_branch_name text,
  p_framework text,
  p_deployment_url text default null
) returns integer language plpgsql security definer set search_path='' as $$
declare project public.website_project_sources;
begin
  perform private.website_require(p_organization_id,'website.manage',p_website_id);
  select * into project from public.website_project_sources
    where organization_id=p_organization_id and website_id=p_website_id for update;
  if project.website_id is null then
    raise exception 'Repository project unavailable' using errcode='42501';
  end if;
  if project.version<>p_version then
    raise exception 'Repository settings changed; reload' using errcode='40001';
  end if;
  perform private.website_project_validate(
    project.source_kind,project.template_key,p_repository_url,p_branch_name,p_framework,p_deployment_url
  );
  update public.website_project_sources
     set repository_url=p_repository_url,
         branch_name=p_branch_name,
         framework=p_framework,
         deployment_url=p_deployment_url,
         version=version+1
   where website_id=p_website_id
   returning version into p_version;
  perform private.website_event(
    p_organization_id,p_website_id,'website.project_updated',
    jsonb_build_object('framework',p_framework)
  );
  return p_version;
end$$;

create function public.website_project_list(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.website_access(p_organization_id,'website.view') then
    raise exception 'Website project access denied' using errcode='42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'websiteId', p.website_id,'sourceKind',p.source_kind,
      'templateKey',p.template_key,'repositoryUrl',p.repository_url,
      'branchName',p.branch_name,'framework',p.framework,
      'deploymentUrl',p.deployment_url,'version',p.version
    ) order by p.created_at),'[]'::jsonb)
    from public.website_project_sources p
    where p.organization_id=p_organization_id
      and private.website_access(p.organization_id,'website.view',p.website_id)
  );
end$$;

revoke all on function public.website_project_create(uuid,text,text,jsonb,text,text,text,text,text),
  public.website_project_configure(uuid,uuid,integer,text,text,text,text),
  public.website_project_list(uuid) from public,anon;
grant execute on function public.website_project_create(uuid,text,text,jsonb,text,text,text,text,text),
  public.website_project_configure(uuid,uuid,integer,text,text,text,text),
  public.website_project_list(uuid) to authenticated;

commit;
