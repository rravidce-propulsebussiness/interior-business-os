begin;
create or replace function private.website_resolve(hostname text) returns uuid language sql stable security definer set search_path='' as $$
 select w.id from public.website_domains d join public.websites w on w.id=d.website_id and w.organization_id=d.organization_id
 where d.hostname=$1 and d.status='active' and d.tls_status='ready' and d.verified_at is not null and w.status='published' and w.published_version_id is not null and private.entitled(w.organization_id,'website')
 and (d.kind='subdomain' or coalesce((private.website_config(w.organization_id)->>'custom_domain')::boolean,false));
$$;
commit;
