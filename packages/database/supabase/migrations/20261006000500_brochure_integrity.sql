begin;
-- Enforce creation capabilities independently from UI and publication checks.
create function private.brochure_draft_guard() returns trigger language plpgsql security definer set search_path='' as $$declare aid uuid;a public.website_assets;begin
 if tg_op='INSERT' then
  if new.document->'form'->>'enabled'='true' and not private.brochure_access(new.organization_id,'brochure.forms.manage') then raise exception 'Form permission required' using errcode='42501';end if;
  if new.document->'settings'->>'sharing'='true' and not private.brochure_access(new.organization_id,'brochure.share') then raise exception 'Sharing permission required' using errcode='42501';end if;
 end if;
 for aid in select private.brochure_assets(new.document) loop select * into a from public.website_assets where id=aid and organization_id=new.organization_id;if a.id is null or a.website_id is not null and not private.website_access(new.organization_id,'website.media.manage',a.website_id) then raise exception 'Source image permission required' using errcode='42501';end if;end loop;
 return new;end$$;
create trigger brochure_draft_guard before insert or update of document on public.brochures for each row execute function private.brochure_draft_guard();
create function private.brochure_kit_guard() returns trigger language plpgsql security definer set search_path='' as $$declare candidate text;a public.website_assets;begin
 for candidate in select distinct value from(select new.content->'brand'->>'logo' value union all select new.content->'brand'->>'secondaryLogo' union all select c->>'asset' from jsonb_array_elements(new.content->'content') c union all select v#>>'{}' from jsonb_array_elements(new.content->'content') c cross join lateral jsonb_array_elements(coalesce(c->'images','[]'))v union all select c->>'asset' from jsonb_array_elements(new.content->'blocks') b cross join lateral jsonb_array_elements(b->'components')c union all select v#>>'{}' from jsonb_array_elements(new.content->'blocks') b cross join lateral jsonb_array_elements(b->'components')c cross join lateral jsonb_array_elements(coalesce(c->'assets','[]'))v)x where value is not null loop
  select * into a from public.website_assets where id=candidate::uuid and organization_id=new.organization_id and status='ready' and mime='image/webp';if a.id is null or a.website_id is not null and not private.website_access(new.organization_id,'website.media.manage',a.website_id) then raise exception 'Brand asset unavailable' using errcode='42501';end if;
 end loop;return new;end$$;
create trigger brochure_kit_guard before insert or update of content on public.marketing_kits for each row execute function private.brochure_kit_guard();
-- Identical organization-owned marketing uploads reuse the existing bytes.
do $$declare definition text;begin select pg_get_functiondef('public.brochure_media(uuid,text,uuid,text,text,text,integer)'::regprocedure) into definition;definition=replace(definition,'select coalesce(sum(bytes),0) into used','select id into target from public.website_assets where organization_id=p_organization_id and website_id is null and status=''ready'' and digest=proof->>''digest'' limit 1;if target is not null then return jsonb_build_object(''id'',target);end if;select coalesce(sum(bytes),0) into used');execute definition;end$$;
revoke all on function private.brochure_draft_guard(),private.brochure_kit_guard() from public,anon,authenticated;
commit;
