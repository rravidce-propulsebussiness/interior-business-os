-- Website Studio: separate frontend and backend source/deployment references.
-- Records are tenant-scoped metadata only. No customer code is executed here.
begin;
alter table public.website_project_sources
  add column backend_repository_url text,
  add column backend_deployment_url text;

-- Reuse the established allowlist for credential-free repositories and public
-- HTTPS deployment URLs. Each URL is validated but never fetched by these RPCs.
create function public.website_project_configure_stack(
  p_organization_id uuid,
  p_website_id uuid,
  p_version integer,
  p_repository_url text,
  p_branch_name text,
  p_framework text,
  p_deployment_url text default null,
  p_backend_repository_url text default null,
  p_backend_deployment_url text default null
) returns integer language plpgsql security definer set search_path='' as $$
declare project public.website_project_sources;
declare next_version integer;
begin
  perform private.website_require(p_organization_id,'website.manage',p_website_id);
  select * into project
    from public.website_project_sources
   where organization_id=p_organization_id and website_id=p_website_id
   for update;
  if project.website_id is null then
    raise exception 'Website project unavailable' using errcode='42501';
  end if;
  if project.version<>p_version then
    raise exception 'Website source changed; reload' using errcode='40001';
  end if;
  -- A template may optionally link to its company-owned source after creation.
  perform private.website_project_validate(
    project.source_kind,project.template_key,p_repository_url,p_branch_name,
    p_framework,p_deployment_url
  );
  if p_backend_repository_url is not null then
    perform private.website_project_validate(
      'repository',null,p_backend_repository_url,'main','other',p_backend_deployment_url
    );
  elsif p_backend_deployment_url is not null then
    raise exception 'Backend repository required for backend deployment' using errcode='22023';
  end if;
  update public.website_project_sources
     set repository_url=p_repository_url,
         branch_name=p_branch_name,
         framework=p_framework,
         deployment_url=p_deployment_url,
         backend_repository_url=p_backend_repository_url,
         backend_deployment_url=p_backend_deployment_url,
         version=version+1
   where organization_id=p_organization_id and website_id=p_website_id
   returning version into next_version;
  perform private.website_event(p_organization_id,p_website_id,'website.project_updated',
    jsonb_build_object('framework',p_framework,'hasBackend',p_backend_repository_url is not null));
  return next_version;
end$$;

create or replace function public.website_project_list(p_organization_id uuid)
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
      'deploymentUrl',p.deployment_url,
      'backendRepositoryUrl',p.backend_repository_url,
      'backendDeploymentUrl',p.backend_deployment_url,
      'version',p.version
    ) order by p.created_at),'[]'::jsonb)
    from public.website_project_sources p
    where p.organization_id=p_organization_id
      and private.website_access(p.organization_id,'website.view',p.website_id)
  );
end$$;

revoke all on function public.website_project_configure_stack(
  uuid,uuid,integer,text,text,text,text,text,text) from public,anon;
grant execute on function public.website_project_configure_stack(
  uuid,uuid,integer,text,text,text,text,text,text) to authenticated;
commit;
