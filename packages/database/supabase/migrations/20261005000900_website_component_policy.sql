begin;
create function private.website_build_allowed(build jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$declare config public.website_platform_settings;node jsonb;host text;begin
 select * into config from public.website_platform_settings where id;
 for node in select value from jsonb_path_query(build,'$.document.** ? (@.type != null && @.props != null)') value loop
  if config.disabled_components ? (node->>'type') then return false;end if;
  if node->'props' ? 'embed' then
   host=substring(node->'props'->>'embed' from '^https://([^/:?#]+)');
   if host is null or not config.allowed_embeds ? host then return false;end if;
  end if;
 end loop;
 return true;
end$$;
create function private.website_validate_build_policy() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not private.website_build_allowed(new.snapshot) then raise exception 'A component or embed is disabled by platform policy' using errcode='42501';end if;return new;
end$$;
create trigger website_build_policy before insert on public.website_versions for each row execute function private.website_validate_build_policy();
revoke all on function private.website_build_allowed(jsonb),private.website_validate_build_policy() from public,anon,authenticated;
create or replace function public.website_public(p_hostname text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w public.websites;v public.website_versions;config jsonb;begin
 if p_hostname is null or length(p_hostname)>253 or p_hostname<>lower(p_hostname) or p_hostname ~ '[/@:\s\\]' then return null;end if;
 select * into w from public.websites where id=private.website_resolve(p_hostname);if w.id is null then return null;end if;
 select * into v from public.website_versions where id=w.published_version_id and website_id=w.id;
 if not private.website_build_allowed(v.snapshot) then return null;end if;
 config=private.website_config(w.organization_id);
 if (coalesce(v.snapshot->'document'->>'css','')<>'' or jsonb_array_length(v.snapshot->'artifacts')>0) and not coalesce((config->>'custom_code')::boolean,false) or jsonb_array_length(v.snapshot->'artifacts')>0 and not coalesce((config->>'developer_mode')::boolean,false) then return null;end if;
 return jsonb_build_object('version',v.id,'publishedAt',v.created_at,'hostname',p_hostname,'build',v.snapshot,'formsEnabled',coalesce((config->>'forms')::boolean,false) and private.entitled(w.organization_id,'crm'));
end$$;

commit;
