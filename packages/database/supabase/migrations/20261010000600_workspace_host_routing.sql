-- A custom hostname may select a tenant dashboard only when it is already
-- verified, HTTPS-ready and serving a published website. Membership is
-- checked again for the authenticated user; untrusted Host values cannot
-- select an arbitrary organization.
begin;

create function public.workspace_organization_for_hostname(p_hostname text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select w.organization_id
  from public.websites w
  where p_hostname is not null
    and length(p_hostname) between 4 and 253
    and p_hostname = lower(p_hostname)
    and p_hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$'
    and w.id = private.website_resolve(p_hostname)
    and private.is_member(w.organization_id)
  limit 1
$$;

revoke all on function public.workspace_organization_for_hostname(text)
  from public, anon;
grant execute on function public.workspace_organization_for_hostname(text)
  to authenticated;

commit;
