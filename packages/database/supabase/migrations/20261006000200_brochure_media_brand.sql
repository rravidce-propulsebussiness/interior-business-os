begin;
-- Reuse the Phase 8 metadata and byte store. NULL website_id denotes organization marketing media.
alter table public.website_assets alter column website_id drop not null;
drop policy website_read on public.website_assets;
create policy website_read on public.website_assets for select to authenticated using(website_id is not null and private.website_access(organization_id,'website.media.manage',website_id));
create policy brochure_media_read on public.website_assets for select to authenticated using(website_id is null and private.brochure_access(organization_id,'brochure.media.manage'));
do $$declare f text;definition text;begin foreach f in array array['public.website_asset_read(uuid,uuid)','public.website_asset_manage(uuid,uuid,integer,text,text,boolean)'] loop select pg_get_functiondef(f::regprocedure) into definition;definition=replace(definition,'if a.id is null','if a.website_id is null or a.id is null');execute definition;end loop;end$$;
create function private.marketing_asset_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' and new.website_id is null and not private.brochure_access(new.organization_id,'brochure.media.manage') then raise exception 'Marketing media permission required' using errcode='42501';end if;
 if tg_op='UPDATE' and (new.digest is distinct from old.digest or new.website_id is distinct from old.website_id or new.organization_id is distinct from old.organization_id) then raise exception 'Asset content and ownership are immutable' using errcode='42501';end if;
 if tg_op='DELETE' or tg_op='UPDATE' and new.status='archived' and old.status<>'archived' then
  if exists(select 1 from public.brochures b where b.organization_id=old.organization_id and old.id in(select private.brochure_assets(b.document))) or exists(select 1 from public.brochure_versions v where v.organization_id=old.organization_id and old.id in(select private.brochure_assets(v.snapshot))) or exists(select 1 from public.marketing_kits k where k.organization_id=old.organization_id and k.content::text like '%'||old.id::text||'%') then raise exception 'This image is referenced by a brochure, brand kit or historical version' using errcode='23514';end if;
 end if;return case when tg_op='DELETE' then old else new end;end$$;
create trigger marketing_asset_guard before insert or update or delete on public.website_assets for each row execute function private.marketing_asset_guard();
create trigger marketing_bytes_immutable before update or delete on private.website_asset_data for each row execute function private.ops_immutable();
create function public.brochure_media(p_organization_id uuid,p_action text,p_asset_id uuid default null,p_proof text default null,p_signature text default null,p_data text default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.website_assets;proof jsonb;data bytea;target uuid;used bigint;begin
 perform private.brochure_require(p_organization_id,'brochure.media.manage');
 if p_action='list' then if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;return(select coalesce(jsonb_agg(x),'[]') from(select id,name,alt,width,height,bytes,status,version from public.website_assets where organization_id=p_organization_id and status='ready' and mime='image/webp' and (website_id is null or private.website_access(p_organization_id,'website.media.manage',website_id)) order by created_at desc,id limit 25 offset(p_page-1)*25)x);end if;
 if p_action='upload' then
  proof=private.website_proof(p_proof,p_signature);if proof->>'purpose' is distinct from 'brochure.asset' or proof->>'organizationId' is distinct from p_organization_id::text or length(p_data)>14000000 then raise exception 'Invalid media proof' using errcode='42501';end if;data=decode(p_data,'base64');
  if encode(extensions.digest(data,'sha256'),'hex') is distinct from proof->>'digest' or proof->>'mime' is distinct from 'image/webp' then raise exception 'Invalid media' using errcode='42501';end if;
  select coalesce(sum(bytes),0) into used from public.website_assets where organization_id=p_organization_id and status='ready';if used+octet_length(data)>(private.brochure_config(p_organization_id)->>'storage_bytes')::bigint then raise exception 'Storage limit reached' using errcode='23514';end if;
  insert into public.website_assets(organization_id,website_id,name,mime,bytes,width,height,alt,digest) values(p_organization_id,null,proof->>'name','image/webp',octet_length(data),(proof->>'width')::integer,(proof->>'height')::integer,proof->>'alt',proof->>'digest') returning id into target;
  insert into private.website_asset_data(asset_id,data) values(target,data);perform private.brochure_event(p_organization_id,null,'brochure.asset.added');return jsonb_build_object('id',target);
 end if;
 select * into a from public.website_assets where organization_id=p_organization_id and id=p_asset_id and status='ready';if a.id is null or a.website_id is not null and not private.website_access(p_organization_id,'website.media.manage',a.website_id) then raise exception 'Unavailable media' using errcode='42501';end if;
 if p_action='read' then return jsonb_build_object('mime',a.mime,'name',a.name,'width',a.width,'height',a.height,'data',(select encode(data,'base64') from private.website_asset_data where asset_id=a.id));
 elsif p_action='archive' then if a.website_id is not null then raise exception 'Manage website media from Website' using errcode='42501';end if;update public.website_assets set status='archived',version=version+1 where id=a.id;perform private.brochure_event(p_organization_id,null,'brochure.asset.removed');return '{}';
 else raise exception 'Invalid media operation' using errcode='22023';end if;
end$$;
create function public.brochure_asset_read(p_organization_id uuid,p_brochure_id uuid,p_asset_id uuid,p_version_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare doc jsonb;a public.website_assets;begin
 if not private.brochure_access(p_organization_id,'brochure.view') then raise exception 'Unavailable media' using errcode='42501';end if;
 if p_version_id is null then select document into doc from public.brochures where organization_id=p_organization_id and id=p_brochure_id;else select snapshot into doc from public.brochure_versions where organization_id=p_organization_id and brochure_id=p_brochure_id and id=p_version_id;end if;
 if doc is null or p_asset_id not in(select private.brochure_assets(doc)) then raise exception 'Unavailable media' using errcode='42501';end if;
 select * into a from public.website_assets where organization_id=p_organization_id and id=p_asset_id and status='ready';if a.id is null then raise exception 'Unavailable media' using errcode='42501';end if;return jsonb_build_object('mime',a.mime,'name',a.name,'width',a.width,'height',a.height,'data',(select encode(data,'base64') from private.website_asset_data where asset_id=a.id));
end$$;
create function public.brochure_kit_save(p_organization_id uuid,p_version integer,p_proof text,p_signature text) returns integer language plpgsql security definer set search_path='' as $$declare proof jsonb;k public.marketing_kits;c jsonb;source uuid;begin
 perform private.brochure_require(p_organization_id,'brochure.brand.manage');proof=private.website_proof(p_proof,p_signature);if proof->>'purpose' is distinct from 'brochure.kit' or proof->>'organizationId' is distinct from p_organization_id::text or (proof->>'version')::integer is distinct from p_version then raise exception 'Invalid kit proof' using errcode='42501';end if;
 insert into public.marketing_kits(organization_id) values(p_organization_id) on conflict do nothing;select * into k from public.marketing_kits where organization_id=p_organization_id for update;if k.version is distinct from p_version then raise exception 'Brand kit changed' using errcode='40001';end if;
 for c in select value from jsonb_array_elements(proof->'kit'->'content') loop
  if c ? 'source' and not exists(select 1 from jsonb_array_elements(k.content->'content') old where old=c) then
   source=(c->'source'->>'id')::uuid;
   if c->'source'->>'kind'='projects' then if not private.has_permission(p_organization_id,'project.view') or not private.entitled(p_organization_id,'projects') or not exists(select 1 from public.projects where id=source and organization_id=p_organization_id) then raise exception 'Project source permission required' using errcode='42501';end if;
   elsif c->'source'->>'kind'='catalog_items' then if not private.has_permission(p_organization_id,'catalog.view') or not private.entitled(p_organization_id,'catalog') or not exists(select 1 from public.catalog_items where id=source and organization_id=p_organization_id) then raise exception 'Catalog source permission required' using errcode='42501';end if;
   else raise exception 'Unavailable source kind' using errcode='22023';end if;
  end if;
 end loop;
 update public.marketing_kits set content=proof->'kit',version=version+1,updated_at=now() where organization_id=p_organization_id returning version into p_version;perform private.brochure_event(p_organization_id,null,'brochure.brand.updated');return p_version;
end$$;
create function public.brochure_sources(p_organization_id uuid,p_kind text,p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.brochure_access(p_organization_id,'brochure.brand.manage') or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Unavailable sources' using errcode='42501';end if;
 if p_kind='projects' then if not private.has_permission(p_organization_id,'project.view') or not private.entitled(p_organization_id,'projects') then raise exception 'Project access required' using errcode='42501';end if;return(select coalesce(jsonb_agg(x),'[]') from(select id,name title from public.projects where organization_id=p_organization_id and position(lower(p_query) in lower(name))>0 order by name,id limit 25 offset(p_page-1)*25)x);
 elsif p_kind='catalog_items' then if not private.has_permission(p_organization_id,'catalog.view') or not private.entitled(p_organization_id,'catalog') then raise exception 'Catalog access required' using errcode='42501';end if;return(select coalesce(jsonb_agg(x),'[]') from(select id,name title,description from public.catalog_items where organization_id=p_organization_id and position(lower(p_query) in lower(name))>0 order by name,id limit 25 offset(p_page-1)*25)x);
 else raise exception 'Invalid source' using errcode='22023';end if;
end$$;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('brochure_media','brochure_asset_read','brochure_kit_save','brochure_sources') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end$$;
revoke all on function private.marketing_asset_guard() from public,anon,authenticated;
commit;
