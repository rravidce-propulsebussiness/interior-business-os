-- Site Delivery: company owners must not need a separately assigned site role.
-- Keep company membership, project entitlement, active project and tenant isolation
-- intact. This only extends the final access check to a verified owner role.
begin;

create or replace function private.site_access(org uuid, project uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(org)
     and private.entitled(org, 'projects')
     and exists (
       select 1
       from public.projects p
       where p.organization_id = org
         and p.id = project
         and p.status = 'active'
     )
     and (
       private.has_permission(org, 'project.manage')
       or private.site_owner(org)
       or private.site_role(org, project) is not null
     );
$$;

comment on function private.site_access(uuid,uuid) is
  'Tenant-scoped active Site Delivery: permitted project managers, assigned site members, or verified company owners, subject to projects entitlement.';

commit;
