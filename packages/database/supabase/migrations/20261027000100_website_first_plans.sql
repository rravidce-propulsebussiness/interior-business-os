-- Website-first plans. Additive, safe for existing tenants: DO NOT alter
-- existing organization plans, subscriptions, or promotional entitlements.
-- Provider-tier assignment must occur only after server-authenticated
-- membership verification is available from ProPulse.
begin;

insert into public.plans (key, name, status)
values
  ('website_basic', 'Website Basic', 'active'),
  ('propulse_growth', 'ProPulse Growth Website', 'active'),
  ('propulse_scale', 'ProPulse Scale Business OS', 'active')
on conflict (key) do nothing;

-- Base website hosting is a Business OS capability; domain registration
-- and domain ownership are never included in these plans.
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id
from public.plans p
join public.modules m on m.key='website' and m.status='active'
where p.key in ('website_basic','propulse_growth','propulse_scale')
on conflict do nothing;

-- Scale gets the existing active Business OS modules, subject to the normal
-- membership/permission rules. Growth and direct Basic remain website-only.
insert into public.plan_modules (plan_id, module_id)
select p.id, m.id
from public.plans p
cross join public.modules m
where p.key='propulse_scale' and m.status='active'
on conflict do nothing;

insert into public.website_plan_limits(plan_id,configuration)
select p.id,
  case
    when p.key='propulse_scale' then
      '{"sites":3,"pages":50,"storage_bytes":52428800,"forms":true,"custom_domain":true,"custom_code":true,"developer_mode":true,"analytics":true,"integrations":true,"template_only":false}'::jsonb
    else
      '{"sites":1,"pages":10,"storage_bytes":10485760,"forms":true,"custom_domain":true,"custom_code":false,"developer_mode":false,"analytics":false,"integrations":false,"template_only":true}'::jsonb
  end
from public.plans p
where p.key in ('website_basic','propulse_growth','propulse_scale')
on conflict (plan_id) do nothing;

commit;
