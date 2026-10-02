begin;
create function public.website_configuration(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.website_access(p_organization_id,'website.view') then raise exception 'Unavailable website configuration' using errcode='42501';end if;
 return jsonb_build_object('limits',private.website_config(p_organization_id),'platform',(select jsonb_build_object('baseDomain',base_domain,'allowedEmbeds',allowed_embeds,'disabledComponents',disabled_components) from public.website_platform_settings where id));
end$$;
create function public.website_prepare_crm(p_organization_id uuid,p_website_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.website_require(p_organization_id,'website.form.manage',p_website_id);
 if not private.entitled(p_organization_id,'crm') then raise exception 'CRM required for enquiry forms' using errcode='42501';end if;
 insert into public.lead_sources(organization_id,name,key) values(p_organization_id,'Website','website') on conflict(organization_id,key) do nothing;
 if not exists(select 1 from public.crm_pipeline_stages where organization_id=p_organization_id and active and outcome='open') then raise exception 'Configure an open CRM stage first' using errcode='23514';end if;
 perform private.website_event(p_organization_id,p_website_id,'form.crm_connected');
end$$;
create function public.website_source_choices(p_organization_id uuid,p_website_id uuid,p_kind text,p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not private.website_access(p_organization_id,'website.page.edit',p_website_id) or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Unavailable sources' using errcode='42501';end if;
 if p_kind='catalog_items' then
  if not private.has_permission(p_organization_id,'catalog.view') or not private.entitled(p_organization_id,'catalog') then raise exception 'Catalog access required to approve a source' using errcode='42501';end if;
  select coalesce(jsonb_agg(x),'[]') into result from(select id,name title,description from public.catalog_items where organization_id=p_organization_id and position(lower(p_query) in lower(name))>0 order by name,id limit 25 offset (p_page-1)*25)x;
 elsif p_kind='projects' then
  if not private.has_permission(p_organization_id,'project.view') or not private.entitled(p_organization_id,'projects') then raise exception 'Project access required to approve a source' using errcode='42501';end if;
  select coalesce(jsonb_agg(x),'[]') into result from(select id,name title from public.projects where organization_id=p_organization_id and position(lower(p_query) in lower(name))>0 order by name,id limit 25 offset (p_page-1)*25)x;
 else raise exception 'Invalid public source type' using errcode='22023';end if;
 return result;
end$$;
revoke all on function public.website_configuration(uuid),public.website_prepare_crm(uuid,uuid),public.website_source_choices(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.website_configuration(uuid),public.website_prepare_crm(uuid,uuid),public.website_source_choices(uuid,uuid,text,text,integer) to authenticated;
commit;
