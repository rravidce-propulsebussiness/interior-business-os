-- Growth and direct Basic websites must originate from published templates.
-- The database remains authoritative even if a user directly calls an RPC.
begin;

create function private.website_create_from_template(p_organization_id uuid,p_name text,p_slug text,p_document jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;config jsonb;platform public.website_platform_settings;begin
 perform private.website_require(p_organization_id,'website.manage');
 config=private.website_config(p_organization_id);
 if (select count(*) from public.websites where organization_id=p_organization_id and status<>'archived')>=least(100,(config->>'sites')::integer) then raise exception 'Website limit reached' using errcode='23514';end if;
 if p_document->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_document->'pages') is distinct from 'array' or coalesce(jsonb_array_length(p_document->'pages'),0)<>1 or p_document->'code' is distinct from '[]'::jsonb or p_document->>'css' is distinct from '' then raise exception 'Start with an empty structured website' using errcode='22023';end if;
 insert into public.websites(organization_id,name,slug,document) values(p_organization_id,p_name,p_slug,p_document) returning id into target;
 insert into public.website_members(organization_id,website_id,user_id) values(p_organization_id,target,auth.uid());
 select * into platform from public.website_platform_settings where id;
 if platform.base_domain is not null then insert into public.website_domains(organization_id,website_id,hostname,kind,status,tls_status,verified_at) values(p_organization_id,target,p_slug||'.'||platform.base_domain,'subdomain',case when platform.managed_subdomain_tls then 'active' else 'verified' end,case when platform.managed_subdomain_tls then 'ready' else 'pending' end,now());end if;
 perform private.website_event(p_organization_id,target,'website.created');return target;
end$$;

revoke all on function private.website_create_from_template(uuid,text,text,jsonb)
from public,anon,authenticated;

create or replace function public.website_create(p_organization_id uuid,p_name text,p_slug text,p_document jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;config jsonb;platform public.website_platform_settings;begin
 perform private.website_require(p_organization_id,'website.manage');
 config=private.website_config(p_organization_id);if coalesce((config->>'template_only')::boolean,false) then raise exception 'Select a published website template for this plan' using errcode='42501';end if;
 if (select count(*) from public.websites where organization_id=p_organization_id and status<>'archived')>=least(100,(config->>'sites')::integer) then raise exception 'Website limit reached' using errcode='23514';end if;
 if p_document->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_document->'pages') is distinct from 'array' or coalesce(jsonb_array_length(p_document->'pages'),0)<>1 or p_document->'code' is distinct from '[]'::jsonb or p_document->>'css' is distinct from '' then raise exception 'Start with an empty structured website' using errcode='22023';end if;
 insert into public.websites(organization_id,name,slug,document) values(p_organization_id,p_name,p_slug,p_document) returning id into target;
 insert into public.website_members(organization_id,website_id,user_id) values(p_organization_id,target,auth.uid());
 select * into platform from public.website_platform_settings where id;
 if platform.base_domain is not null then insert into public.website_domains(organization_id,website_id,hostname,kind,status,tls_status,verified_at) values(p_organization_id,target,p_slug||'.'||platform.base_domain,'subdomain',case when platform.managed_subdomain_tls then 'active' else 'verified' end,case when platform.managed_subdomain_tls then 'ready' else 'pending' end,now());end if;
 perform private.website_event(p_organization_id,target,'website.created');return target;
end$$;

create or replace function public.website_from_template(p_organization_id uuid,p_template_id uuid,p_name text,p_slug text,p_empty_document jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.website_templates; target uuid; section text; next_version integer; doc jsonb;
begin
  perform private.website_require(p_organization_id,'website.manage');
  select * into t from public.website_templates where id=p_template_id and status='published' for share;
  if t.id is null then raise exception 'Template unavailable' using errcode='42501'; end if;
  target=private.website_create_from_template(p_organization_id,p_name,p_slug,p_empty_document);
  select version into next_version from public.websites where id=target;
  doc=jsonb_set(t.document,'{settings,name}',to_jsonb(p_name));
  foreach section in array array['theme','css','navigation','footerNavigation','header','footer','pages','forms','content','sections','code','settings'] loop
    if doc->section is distinct from p_empty_document->section then
      next_version=public.website_save(p_organization_id,target,next_version,section,doc->section);
    end if;
  end loop;
  perform private.website_event(p_organization_id,target,'website.template_applied',jsonb_build_object('templateId',t.id,'templateVersion',t.version));
  return target;
end $$;

commit;
