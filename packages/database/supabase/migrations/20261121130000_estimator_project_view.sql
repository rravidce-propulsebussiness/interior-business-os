-- Estimators open project BOQs: the BOQ page lists the company's projects and
-- their Final quotations, and projects are readable only with project.view.
-- Without it an estimator saw a saved BOQ as "No Project Linked" with no items.
insert into private.role_template_permissions(role_key, permission_key)
values ('estimator', 'project.view')
on conflict do nothing;

insert into public.role_permissions(organization_id, role_id, permission_id)
select r.organization_id, r.id, p.id
from public.roles r
join public.permissions p on p.key = 'project.view'
where r.key = 'estimator'
on conflict do nothing;
