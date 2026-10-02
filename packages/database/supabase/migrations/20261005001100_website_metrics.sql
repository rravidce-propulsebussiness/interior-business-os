begin;
create function public.website_record_view(p_hostname text,p_path text) returns void language plpgsql security definer set search_path='' as $$declare site uuid;begin
 site=private.website_resolve(p_hostname);
 if site is null or length(p_path)>180 or not exists(select 1 from public.websites w join public.website_versions v on v.id=w.published_version_id cross join lateral jsonb_array_elements(v.snapshot->'document'->'pages') p where w.id=site and p->>'path'=p_path) then return;end if;
 insert into private.website_metrics(website_id,day,kind,hits) values(site,current_date,'page_view',1) on conflict(website_id,day,kind) do update set hits=least(private.website_metrics.hits+1,1000000);
end$$;
create function public.website_metrics_read(p_organization_id uuid,p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.website_access(p_organization_id,'website.view',p_website_id) then raise exception 'Website access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(x order by day desc,kind),'[]') from(select day,kind,hits from private.website_metrics where website_id=p_website_id and day>=current_date-30)x);
end$$;
revoke all on function public.website_record_view(text,text),public.website_metrics_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.website_record_view(text,text) to anon,authenticated;
grant execute on function public.website_metrics_read(uuid,uuid) to authenticated;
commit;
