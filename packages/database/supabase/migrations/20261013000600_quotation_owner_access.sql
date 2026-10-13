-- A quotation draft needs a customer and a project, even when a tenant
-- subscribes only to Quotation Studio. Keep actual permissions, membership
-- scope and explicit module denials authoritative.
begin;

-- Historical organizations may have been provisioned before customer/quote
-- permissions were added to the owner template. Repair the template and all
-- existing tenant owner roles; do not expand non-owner roles.
insert into private.role_template_permissions(role_key, permission_key)
select 'owner', p.key
from public.permissions p
where p.scope = 'organization'
  and p.key in (
    'quotation.view', 'quotation.create', 'quotation.edit', 'quotation.issue',
    'quotation.share', 'quotation.override_rate', 'quotation.discount',
    'customer.view', 'customer.create', 'project.view', 'project.create',
    'settings.manage'
  )
on conflict do nothing;

insert into public.role_permissions(organization_id, role_id, permission_id)
select r.organization_id, r.id, p.id
from public.roles r
join private.role_template_permissions template
  on template.role_key = 'owner'
join public.permissions p
  on p.key = template.permission_key and p.scope = 'organization'
where r.is_owner
on conflict do nothing;

-- Quotation Studio must be able to create/read the project's record.
-- Projects can therefore be activated by a Quotation entitlement as an
-- intrinsic dependency. This does NOT grant project.create/view rights:
-- those still require a matching scoped role permission. A deliberate
-- "projects" disabled entitlement always wins, including for owners.
create or replace function private.entitled(org uuid, module_key text)
returns boolean language sql stable security definer set search_path = ''
as $entitled$
  select exists (
    select 1
    from public.organizations o
    join public.modules target
      on target.key = module_key and target.status = 'active'
    join public.modules source_module
      on source_module.status = 'active'
     and (
       source_module.id = target.id
       or (target.key = 'projects' and source_module.key = 'quotation')
     )
    where o.id = org and o.status in ('active', 'trial')
      -- Respect an explicit module disable even when quotation is active.
      and not exists (
        select 1 from public.organization_entitlements disabled
        where disabled.organization_id = o.id
          and disabled.module_id = target.id
          and disabled.enabled = false
          and disabled.valid_from <= now()
          and (disabled.valid_until is null or disabled.valid_until > now())
      )
      and not exists (
        select 1 from public.organization_entitlements disabled
        where disabled.organization_id = o.id
          and disabled.module_id = source_module.id
          and disabled.enabled = false
          and disabled.valid_from <= now()
          and (disabled.valid_until is null or disabled.valid_until > now())
      )
      and (
        exists (
          select 1 from public.organization_entitlements granted
          where granted.organization_id = o.id
            and granted.module_id = source_module.id
            and granted.enabled = true
            and granted.valid_from <= now()
            and (granted.valid_until is null or granted.valid_until > now())
        )
        or exists (
          select 1 from public.plan_modules pm
          join public.plans plan
            on plan.id = pm.plan_id and plan.status = 'active'
          where pm.plan_id = o.plan_id
            and pm.module_id = source_module.id
        )
      )
  );
$entitled$;

commit;
