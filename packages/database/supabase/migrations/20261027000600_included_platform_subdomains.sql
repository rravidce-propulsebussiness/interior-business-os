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

-- Existing sites created before base-domain setup receive their reserved
-- platform hostname when this migration is applied to a configured host.
update public.website_platform_settings
set updated_at=now()
where id and base_domain is not null;

commit;
