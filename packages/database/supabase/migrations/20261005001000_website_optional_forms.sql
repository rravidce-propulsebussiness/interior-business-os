begin;
create or replace function public.website_publish(p_organization_id uuid,p_website_id uuid,p_version integer,p_build_text text,p_signature text,p_summary text,p_restore_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare w public.websites;proof jsonb;build jsonb;target uuid;seq integer;config jsonb;a jsonb;domain_count integer;begin
 perform private.website_require(p_organization_id,'website.page.publish',p_website_id);
 select * into w from public.websites where organization_id=p_organization_id and id=p_website_id for update;
 if w.id is null or w.status in ('suspended','archived') then raise exception 'Unavailable website' using errcode='42501';end if;
 if w.version is distinct from p_version then raise exception 'Stale publish' using errcode='40001';end if;
 proof=private.website_proof(p_build_text,p_signature);
 if proof->>'purpose' is distinct from 'website.publish' or proof->>'organizationId' is distinct from p_organization_id::text or proof->>'websiteId' is distinct from w.id::text or (proof->>'version')::integer is distinct from w.version or proof->>'restoreId' is distinct from p_restore_id::text then raise exception 'Build ownership mismatch' using errcode='42501';end if;
 if p_restore_id is not null then perform private.website_require(p_organization_id,'website.page.restore',w.id);if not exists(select 1 from public.website_versions where id=p_restore_id and website_id=w.id and organization_id=p_organization_id) then raise exception 'Unavailable restore version' using errcode='42501';end if;end if;
 build=proof->'build';config=private.website_config(p_organization_id);
 if build->>'schemaVersion' is distinct from '1' or jsonb_typeof(build->'document'->'pages') is distinct from 'array' or jsonb_array_length(build->'document'->'pages') not between 1 and least(200,(config->>'pages')::integer) then raise exception 'Invalid build' using errcode='22023';end if;
 if coalesce(build->'document'->>'css','')<>'' or jsonb_array_length(build->'artifacts')>0 then
  perform private.website_require(p_organization_id,'website.custom_code.publish',w.id);
  if not coalesce((config->>'custom_code')::boolean,false) or jsonb_array_length(build->'artifacts')>0 and not coalesce((config->>'developer_mode')::boolean,false) then raise exception 'Custom code capability required' using errcode='42501';end if;
 end if;
 if jsonb_path_exists(build,'$.document.forms[*] ? (@.enabled == true)') and (not coalesce((config->>'forms')::boolean,false) or not private.entitled(p_organization_id,'crm')) then raise exception 'Website forms require Forms capability and CRM' using errcode='42501';end if;
 for a in select value from jsonb_array_elements(build->'document'->'assets') loop
  if not exists(select 1 from public.website_assets where organization_id=p_organization_id and website_id=w.id and id=(a->>'assetId')::uuid and status='ready') then raise exception 'Unavailable asset' using errcode='42501';end if;
 end loop;
 select coalesce(max(sequence),0)+1 into seq from public.website_versions where website_id=w.id;
 insert into public.website_versions(organization_id,website_id,sequence,summary,snapshot,restored_from) values(p_organization_id,w.id,seq,p_summary,build,p_restore_id) returning id into target;
 update public.websites set published_version_id=target,status='published',version=version+1 where id=w.id;
 perform private.website_event(p_organization_id,w.id,case when p_restore_id is null then 'website.published' else 'website.version_restored' end,jsonb_build_object('sequence',seq,'versionId',target));return target;
end$$;

commit;
