begin;
-- Raw code and draft JSON are available only through permission-filtered projections.
revoke select on public.websites,public.website_versions from authenticated;
grant select(id,organization_id,version,created_by,created_at,updated_at,name,slug,status,published_version_id) on public.websites to authenticated;
grant select(id,organization_id,version,created_by,created_at,updated_at,website_id,sequence,summary,restored_from) on public.website_versions to authenticated;

create function private.website_proof(body text,signature text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare value jsonb;secret bytea;begin
 if body is null or octet_length(body)>3500000 or signature is null then raise exception 'Build proof required' using errcode='22023';end if;
 value=body::jsonb;select k.secret into secret from private.website_build_keys k where k.key_id=value->>'keyId' and k.active;
 if secret is null or encode(extensions.hmac(convert_to(body,'UTF8'),secret,'sha256'),'hex') is distinct from signature or (value->>'expiresAt')::timestamptz<now() or (value->>'expiresAt')::timestamptz>now()+interval '10 minutes' then raise exception 'Invalid or expired build proof' using errcode='42501';end if;
 return value;
end$$;
create function public.website_read(p_organization_id uuid,p_website_id uuid,p_version_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w public.websites;v public.website_versions;doc jsonb;begin
 perform private.website_require(p_organization_id,'website.view',p_website_id);
 select * into w from public.websites where organization_id=p_organization_id and id=p_website_id;if w.id is null then raise exception 'Unavailable website' using errcode='42501';end if;
 if p_version_id is null then doc=w.document;else select * into v from public.website_versions where organization_id=p_organization_id and website_id=w.id and id=p_version_id;if v.id is null then raise exception 'Unavailable version' using errcode='42501';end if;doc=v.snapshot->'document';end if;
 if not private.website_access(p_organization_id,'website.custom_code.view',w.id) then doc=jsonb_set(doc,'{code}','[]');end if;
 return jsonb_build_object('id',w.id,'name',w.name,'slug',w.slug,'status',w.status,'version',w.version,'publishedVersionId',w.published_version_id,'document',doc,'limits',private.website_config(p_organization_id),'selectedVersion',case when v.id is null then null else jsonb_build_object('id',v.id,'sequence',v.sequence,'createdAt',v.created_at,'summary',v.summary) end);
end$$;
create function public.website_create(p_organization_id uuid,p_name text,p_slug text,p_document jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;config jsonb;platform public.website_platform_settings;begin
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
create function public.website_save(p_organization_id uuid,p_website_id uuid,p_version integer,p_section text,p_value jsonb) returns integer language plpgsql security definer set search_path='' as $$declare w public.websites;permission text;config jsonb;old_page jsonb;page jsonb;begin
 permission=case p_section when 'pages' then 'website.page.edit' when 'theme' then 'website.theme.manage' when 'css' then 'website.custom_css.manage' when 'navigation' then 'website.navigation.manage' when 'footerNavigation' then 'website.navigation.manage' when 'forms' then 'website.form.manage' when 'code' then 'website.custom_code.edit' when 'settings' then 'website.seo.manage' when 'header' then 'website.page.edit' when 'footer' then 'website.page.edit' when 'sections' then 'website.page.edit' when 'content' then 'website.page.edit' when 'assets' then 'website.media.manage' else null end;
 if permission is null then raise exception 'Unknown website section' using errcode='22023';end if;
 perform private.website_require(p_organization_id,permission,p_website_id);
 select * into w from public.websites where organization_id=p_organization_id and id=p_website_id for update;
 if w.id is null or w.status in ('archived','suspended') then raise exception 'Unavailable website' using errcode='42501';end if;
 if w.version is distinct from p_version then raise exception 'Draft changed; reload before saving' using errcode='40001';end if;
 if p_value is null or octet_length(p_value::text)>1500000 then raise exception 'Invalid section size' using errcode='22023';end if;
 config=private.website_config(p_organization_id);
 if p_section in ('css','code') and not coalesce((config->>'custom_code')::boolean,false) or p_section='code' and not coalesce((config->>'developer_mode')::boolean,false) then raise exception 'Custom code capability required' using errcode='42501';end if;
 if p_section='forms' and not coalesce((config->>'forms')::boolean,false) then raise exception 'Forms capability required' using errcode='42501';end if;
 if p_section in ('pages','forms','code','navigation','footerNavigation','header','footer','sections','content','assets') and jsonb_typeof(p_value) is distinct from 'array' or p_section in ('theme','settings') and jsonb_typeof(p_value) is distinct from 'object' or p_section='css' and jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Invalid section type' using errcode='22023';end if;
 if p_section='pages' then
  if jsonb_array_length(p_value) not between 1 and least(200,(config->>'pages')::integer) then raise exception 'Page limit reached' using errcode='23514';end if;
  for page in select value from jsonb_array_elements(p_value) loop
   select value into old_page from jsonb_array_elements(w.document->'pages') where value->>'id'=page->>'id';
   if old_page is null then perform private.website_require(p_organization_id,'website.page.create',w.id);
   elsif old_page->'seo' is distinct from page->'seo' or old_page->'path' is distinct from page->'path' then perform private.website_require(p_organization_id,'website.seo.manage',w.id);end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(w.document->'pages') old where not exists(select 1 from jsonb_array_elements(p_value) n where n->>'id'=old->>'id')) then perform private.website_require(p_organization_id,'website.page.delete',w.id);end if;
 end if;
 update public.websites set document=jsonb_set(document,array[p_section],p_value),version=version+1 where id=w.id returning version into p_version;
 perform private.website_event(p_organization_id,w.id,case p_section when 'code' then 'custom_code.updated' when 'theme' then 'theme.updated' when 'forms' then 'form.updated' when 'navigation' then 'navigation.updated' else 'website.updated' end,jsonb_build_object('section',p_section,'version',p_version));return p_version;
end$$;
create function public.website_publish(p_organization_id uuid,p_website_id uuid,p_version integer,p_build_text text,p_signature text,p_summary text,p_restore_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare w public.websites;proof jsonb;build jsonb;target uuid;seq integer;config jsonb;a jsonb;domain_count integer;begin
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
 if jsonb_array_length(build->'document'->'forms')>0 and (not coalesce((config->>'forms')::boolean,false) or not private.entitled(p_organization_id,'crm')) then raise exception 'Website forms require Forms capability and CRM' using errcode='42501';end if;
 for a in select value from jsonb_array_elements(build->'document'->'assets') loop
  if not exists(select 1 from public.website_assets where organization_id=p_organization_id and website_id=w.id and id=(a->>'assetId')::uuid and status='ready') then raise exception 'Unavailable asset' using errcode='42501';end if;
 end loop;
 select coalesce(max(sequence),0)+1 into seq from public.website_versions where website_id=w.id;
 insert into public.website_versions(organization_id,website_id,sequence,summary,snapshot,restored_from) values(p_organization_id,w.id,seq,p_summary,build,p_restore_id) returning id into target;
 update public.websites set published_version_id=target,status='published',version=version+1 where id=w.id;
 perform private.website_event(p_organization_id,w.id,case when p_restore_id is null then 'website.published' else 'website.version_restored' end,jsonb_build_object('sequence',seq,'versionId',target));return target;
end$$;
create function public.website_status(p_organization_id uuid,p_website_id uuid,p_version integer,p_status text) returns void language plpgsql security definer set search_path='' as $$declare w public.websites;begin
 perform private.website_require(p_organization_id,'website.page.publish',p_website_id);
 select * into w from public.websites where organization_id=p_organization_id and id=p_website_id for update;
 if w.version is distinct from p_version or w.status in ('suspended','archived') then raise exception 'Stale or unavailable website' using errcode='40001';end if;
 if p_status not in ('unpublished','archived') then raise exception 'Invalid status' using errcode='22023';end if;
 if p_status='archived' then perform private.website_require(p_organization_id,'website.manage',w.id);update public.website_domains set status='removed',version=version+1 where website_id=w.id and status<>'removed';end if;
 update public.websites set status=p_status,version=version+1 where id=w.id;
 perform private.website_event(p_organization_id,w.id,'website.'||p_status);
end$$;
create function public.website_assign(p_organization_id uuid,p_website_id uuid,p_user_id uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.website_require(p_organization_id,'website.scope.manage',p_website_id);
 if not exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='active' and p.status='active') then raise exception 'Unavailable member' using errcode='42501';end if;
 insert into public.website_members(organization_id,website_id,user_id,active) values(p_organization_id,p_website_id,p_user_id,p_active) on conflict(website_id,user_id) do update set active=excluded.active,version=public.website_members.version+1;
 perform private.website_event(p_organization_id,p_website_id,'website.assignment_updated',jsonb_build_object('userId',p_user_id,'active',p_active));
end$$;
revoke all on function private.website_proof(text,text) from public,anon,authenticated;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('website_read','website_create','website_save','website_publish','website_status','website_assign') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end$$;
commit;
