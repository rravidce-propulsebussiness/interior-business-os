begin;
-- Draft preview may resolve only approved kit assets actually bound by this draft.
-- Published editions keep their immutable, explicit snapshot references.
create or replace function public.brochure_asset_read(p_organization_id uuid,p_brochure_id uuid,p_asset_id uuid,p_version_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb; kit jsonb; component jsonb; item jsonb; allowed boolean := false; a public.website_assets;
begin
 if not private.brochure_access(p_organization_id,'brochure.view') then raise exception 'Unavailable media' using errcode='42501';end if;
 if p_version_id is null then select document into doc from public.brochures where organization_id=p_organization_id and id=p_brochure_id;
 else select snapshot into doc from public.brochure_versions where organization_id=p_organization_id and brochure_id=p_brochure_id and id=p_version_id;end if;
 if doc is null then raise exception 'Unavailable media' using errcode='42501';end if;
 allowed := p_asset_id in(select private.brochure_assets(doc));
 if not allowed and p_version_id is null then
  select content into kit from public.marketing_kits where organization_id=p_organization_id;
  for component in select c from jsonb_array_elements(doc->'pages') p cross join lateral jsonb_array_elements(p->'components') c where not coalesce((c->>'hidden')::boolean,false) loop
   if component->>'binding'='logo' and kit->'brand'->>'logo'=p_asset_id::text then allowed:=true;end if;
   for item in select value from jsonb_array_elements(kit->'content') where value->>'id'=component->>'binding' and value->>'public'='true' loop
    if item->>'asset'=p_asset_id::text or coalesce(item->'images','[]'::jsonb) ? p_asset_id::text then allowed:=true;end if;
   end loop;
  end loop;
 end if;
 if not allowed then raise exception 'Unavailable media' using errcode='42501';end if;
 select * into a from public.website_assets where organization_id=p_organization_id and id=p_asset_id and status='ready';
 if a.id is null then raise exception 'Unavailable media' using errcode='42501';end if;
 return jsonb_build_object('mime',a.mime,'name',a.name,'width',a.width,'height',a.height,'data',(select encode(data,'base64') from private.website_asset_data where asset_id=a.id));
end$$;
commit;
