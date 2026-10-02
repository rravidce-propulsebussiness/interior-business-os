begin;
create function public.website_domain_add(p_organization_id uuid,p_website_id uuid,p_hostname text) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;base text;begin
 perform private.website_require(p_organization_id,'website.domain.manage',p_website_id);
 if not coalesce((private.website_config(p_organization_id)->>'custom_domain')::boolean,false) then raise exception 'Custom domain capability required' using errcode='42501';end if;
 select base_domain into base from public.website_platform_settings where id;
 if p_hostname<>lower(p_hostname) or length(p_hostname)>253 or p_hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or p_hostname ~ '(\.localhost|\.local|\.internal|\.test|\.example)$' or p_hostname=base or p_hostname like '%.'||base then raise exception 'Invalid custom hostname' using errcode='22023';end if;
 if exists(select 1 from public.websites where id=p_website_id and status in ('suspended','archived')) then raise exception 'Unavailable website' using errcode='42501';end if;
 if (select count(*) from public.website_domains where website_id=p_website_id and status<>'removed')>=10 then raise exception 'Domain limit reached' using errcode='23514';end if;
 insert into public.website_domains(organization_id,website_id,hostname,kind) values(p_organization_id,p_website_id,p_hostname,'custom') returning id into target;
 perform private.website_event(p_organization_id,p_website_id,'domain.added',jsonb_build_object('domainId',target));return target;
end$$;
create function public.website_domain_check(p_organization_id uuid,p_domain_id uuid,p_proof text,p_signature text) returns text language plpgsql security definer set search_path='' as $$declare d public.website_domains;proof jsonb;state text;begin
 select * into d from public.website_domains where organization_id=p_organization_id and id=p_domain_id;
 perform private.website_require(p_organization_id,'website.domain.manage',d.website_id);
 if d.id is null or d.kind<>'custom' or d.status in ('removed','suspended') then raise exception 'Unavailable domain' using errcode='42501';end if;
 if not coalesce((private.website_config(p_organization_id)->>'custom_domain')::boolean,false) then raise exception 'Custom domain capability required' using errcode='42501';end if;
 proof=private.website_proof(p_proof,p_signature);
 if proof->>'purpose' is distinct from 'website.domain' or proof->>'organizationId' is distinct from p_organization_id::text or proof->>'domainId' is distinct from d.id::text or proof->>'hostname' is distinct from d.hostname or proof->>'challenge' is distinct from d.challenge then raise exception 'Invalid verification proof' using errcode='42501';end if;
 state=case when proof->>'dns'='true' and proof->>'tls'='true' then 'active' when proof->>'dns'='true' then 'verified' else 'failed' end;
 update public.website_domains set status=state,tls_status=case when proof->>'tls'='true' then 'ready' else 'pending' end,verified_at=case when proof->>'dns'='true' then now() else null end,last_checked_at=now(),failure_reason=case when state='failed' then 'DNS ownership or routing not verified' when state='verified' then 'DNS verified; HTTPS certificate not ready' else '' end,version=version+1 where id=d.id;
 perform private.website_event(p_organization_id,d.website_id,'domain.verified',jsonb_build_object('domainId',d.id,'status',state));return state;
end$$;
create function public.website_domain_remove(p_organization_id uuid,p_domain_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare d public.website_domains;begin
 select * into d from public.website_domains where organization_id=p_organization_id and id=p_domain_id;perform private.website_require(p_organization_id,'website.domain.manage',d.website_id);
 if d.id is null or d.version is distinct from p_version then raise exception 'Stale domain' using errcode='40001';end if;
 update public.website_domains set status='removed',version=version+1 where id=d.id;
 perform private.website_event(p_organization_id,d.website_id,'domain.removed',jsonb_build_object('domainId',d.id));
end$$;
create function private.website_resolve(hostname text) returns uuid language sql stable security definer set search_path='' as $$
 select w.id from public.website_domains d join public.websites w on w.id=d.website_id and w.organization_id=d.organization_id
 where d.hostname=hostname and d.status='active' and d.tls_status='ready' and d.verified_at is not null and w.status='published' and w.published_version_id is not null and private.entitled(w.organization_id,'website')
 and (d.kind='subdomain' or coalesce((private.website_config(w.organization_id)->>'custom_domain')::boolean,false));$$;
create function public.website_public(p_hostname text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w public.websites;v public.website_versions;config jsonb;begin
 if p_hostname is null or length(p_hostname)>253 or p_hostname<>lower(p_hostname) or p_hostname ~ '[/@:\s\\]' then return null;end if;
 select * into w from public.websites where id=private.website_resolve(p_hostname);if w.id is null then return null;end if;
 select * into v from public.website_versions where id=w.published_version_id and website_id=w.id;
 config=private.website_config(w.organization_id);
 if (coalesce(v.snapshot->'document'->>'css','')<>'' or jsonb_array_length(v.snapshot->'artifacts')>0) and not coalesce((config->>'custom_code')::boolean,false) or jsonb_array_length(v.snapshot->'artifacts')>0 and not coalesce((config->>'developer_mode')::boolean,false) then return null;end if;
 return jsonb_build_object('version',v.id,'publishedAt',v.created_at,'hostname',p_hostname,'build',v.snapshot,'formsEnabled',coalesce((config->>'forms')::boolean,false) and private.entitled(w.organization_id,'crm'));
end$$;
create function public.website_platform_update(p_operation text,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$declare site public.websites;config jsonb;key text;begin
 perform private.require_platform('platform.entitlements.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>10000 then raise exception 'Invalid platform website settings' using errcode='22023';end if;
 if p_operation='settings' then
  if p_input-array['baseDomain','managedTls','allowedEmbeds','disabledComponents']<>'{}' or p_input->>'baseDomain' !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or jsonb_typeof(p_input->'managedTls') is distinct from 'boolean' then raise exception 'Invalid platform domain configuration' using errcode='22023';end if;
  update public.website_platform_settings set base_domain=p_input->>'baseDomain',managed_subdomain_tls=(p_input->>'managedTls')::boolean,allowed_embeds=coalesce(p_input->'allowedEmbeds',allowed_embeds),disabled_components=coalesce(p_input->'disabledComponents',disabled_components),updated_at=now() where id;
 elsif p_operation='plan' then
  config=p_input->'configuration';if jsonb_typeof(config) is distinct from 'object' or config-array['sites','pages','storage_bytes','forms','custom_domain','custom_code','developer_mode','analytics','integrations']<>'{}' then raise exception 'Invalid website capabilities' using errcode='22023';end if;
  foreach key in array array['sites','pages','storage_bytes'] loop if config ? key and ((config->>key)::bigint<1 or (config->>key)::bigint>1073741824) then raise exception 'Invalid limit' using errcode='22023';end if;end loop;
  foreach key in array array['forms','custom_domain','custom_code','developer_mode','analytics','integrations'] loop if config ? key and jsonb_typeof(config->key)<>'boolean' then raise exception 'Invalid capability' using errcode='22023';end if;end loop;
  insert into public.website_plan_limits(plan_id,configuration) values((p_input->>'planId')::uuid,config) on conflict(plan_id) do update set configuration=excluded.configuration;
 elsif p_operation='suspend' or p_operation='resume' then
  perform private.require_platform('platform.organizations.manage');
  select * into site from public.websites where id=(p_input->>'websiteId')::uuid for update;
  if site.id is null or site.status='archived' or length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Website and reason required' using errcode='22023';end if;
  update public.websites set status=case when p_operation='suspend' then 'suspended' else 'unpublished' end,version=version+1 where id=site.id;
  perform private.website_event(site.organization_id,site.id,'website.platform_'||p_operation,jsonb_build_object('reason',left(p_input->>'reason',500)));
 else raise exception 'Unknown platform operation' using errcode='22023';end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'website.platform_configuration','website_platform_settings','configuration',jsonb_build_object('operation',p_operation));
end$$;
revoke all on function private.website_resolve(text),public.website_public(text) from public,anon,authenticated;
grant execute on function public.website_public(text) to anon,authenticated;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('website_domain_add','website_domain_check','website_domain_remove','website_platform_update') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end$$;
commit;
