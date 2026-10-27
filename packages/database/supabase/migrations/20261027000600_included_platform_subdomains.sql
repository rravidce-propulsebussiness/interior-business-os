-- Included Business OS subdomains must not depend on whether platform
-- domain settings were configured before the customer's site was created.
-- Backfill only platform-owned subdomain records. Never rewrite/delete custom
-- domains or website contents when customers upgrade their subscription.
begin;

create function private.website_ensure_included_subdomains()
returns trigger
language plpgsql security definer set search_path = ''
as $subdomains$
begin
  if new.base_domain is null then
    return new;
  end if;

  -- Slugs are globally unique. An included hostname is reserved on the
  -- platform base domain without buying or transferring any customer domain.
  insert into public.website_domains(
    organization_id,website_id,hostname,kind,status,tls_status,verified_at
  )
  select
    w.organization_id,w.id,w.slug||'.'||new.base_domain,'subdomain',
    case when new.managed_subdomain_tls then 'active' else 'verified' end,
    case when new.managed_subdomain_tls then 'ready' else 'pending' end,
    now()
  from public.websites w
  where w.status <> 'archived'
    and not exists (
      select 1 from public.website_domains d
      where d.website_id=w.id
        and d.hostname=w.slug||'.'||new.base_domain
        and d.kind='subdomain' and d.status<>'removed'
    )
  on conflict do nothing;

  -- Promoting managed HTTPS makes already-reserved platform subdomains
  -- usable without making customers connect/purchase their own domain.
  -- Custom domains remain subject to independent ownership/DNS/TLS proofs.
  if new.managed_subdomain_tls then
    update public.website_domains d
    set status='active',tls_status='ready',verified_at=coalesce(d.verified_at,now()),
        last_checked_at=now(),failure_reason='',version=d.version+1
    from public.websites w
    where w.id=d.website_id and w.organization_id=d.organization_id
      and d.kind='subdomain' and d.hostname=w.slug||'.'||new.base_domain
      and d.status='verified' and d.tls_status='pending'
      and w.status<>'archived';
  end if;

  return new;
end
$subdomains$;

create trigger website_platform_included_subdomains
after update of base_domain, managed_subdomain_tls
on public.website_platform_settings
for each row execute function private.website_ensure_included_subdomains();

-- Customers may disconnect a domain they own. The included Business OS
-- hostname is infrastructure-owned and must not be removable from an API
-- call; removing it would break the guaranteed platform publishing address.
create or replace function public.website_domain_remove(
  p_organization_id uuid,p_domain_id uuid,p_version integer
)
returns void
language plpgsql security definer set search_path = ''
as $remove$
declare
  d public.website_domains%rowtype;
begin
  select * into d from public.website_domains
    where organization_id=p_organization_id and id=p_domain_id;
  perform private.website_domain_require(p_organization_id,d.website_id);
  if d.id is null or d.version is distinct from p_version then
    raise exception 'Stale domain' using errcode='40001';
  end if;
  if d.kind <> 'custom' then
    raise exception 'Included Business OS subdomains cannot be disconnected'
      using errcode='42501';
  end if;
  update public.website_domains set status='removed',version=version+1
    where id=d.id;
  perform private.website_event(
    p_organization_id,d.website_id,'domain.removed',
    jsonb_build_object('domainId',d.id)
  );
end
$remove$;

-- Existing sites created before base-domain setup receive their reserved
-- platform hostname when this migration is applied to a configured host.
update public.website_platform_settings
set base_domain=base_domain,updated_at=now()
where id and base_domain is not null;

commit;
