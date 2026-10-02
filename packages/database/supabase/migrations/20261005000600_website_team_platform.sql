begin;
create function public.website_team_choices(p_organization_id uuid,p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.website_access(p_organization_id,'website.scope.manage',p_website_id) then raise exception 'Unavailable members' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(x),'[]') from(select m.user_id id,coalesce(nullif(p.full_name,''),'Organization member') name,exists(select 1 from public.website_members w where w.website_id=p_website_id and w.user_id=m.user_id and w.active) assigned from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id and m.status='active' and p.status='active' order by p.full_name,m.user_id limit 100)x);
end$$;
create function public.website_grant_developer(p_organization_id uuid,p_website_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$declare role_id uuid;permission record;begin
 perform private.website_require(p_organization_id,'website.scope.manage',p_website_id);
 if not private.has_permission(p_organization_id,'role.manage') then raise exception 'Role management required' using errcode='42501';end if;
 if not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_user_id and status='active' and branch_id is null) then raise exception 'Active organization member required' using errcode='42501';end if;
 insert into public.roles(organization_id,key,name) values(p_organization_id,'website_developer','Website Developer') on conflict(organization_id,key) do nothing;
 select id into role_id from public.roles where organization_id=p_organization_id and key='website_developer';
 for permission in select * from public.permissions where scope='organization' and key like 'website.%' and key not in ('website.scope.manage','website.manage') loop
  if not private.has_permission(p_organization_id,permission.key) then raise exception 'Cannot delegate a permission you do not hold' using errcode='42501';end if;
  insert into public.role_permissions(organization_id,role_id,permission_id) values(p_organization_id,role_id,permission.id) on conflict do nothing;
 end loop;
 insert into public.membership_roles(organization_id,membership_id,role_id) select p_organization_id,id,role_id from public.organization_memberships where organization_id=p_organization_id and user_id=p_user_id on conflict do nothing;
 perform public.website_assign(p_organization_id,p_website_id,p_user_id,true);
 perform private.website_event(p_organization_id,p_website_id,'website.developer_granted',jsonb_build_object('userId',p_user_id));
end$$;
create function public.website_platform_list(p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.require_platform('platform.organizations.view');if p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(x),'[]') from(select w.id,w.name,w.slug,w.status,o.name organization from public.websites w join public.organizations o on o.id=w.organization_id order by w.created_at desc,w.id limit 25 offset (p_page-1)*25)x);
end$$;
revoke all on function public.website_team_choices(uuid,uuid),public.website_grant_developer(uuid,uuid,uuid),public.website_platform_list(integer) from public,anon;
grant execute on function public.website_team_choices(uuid,uuid),public.website_grant_developer(uuid,uuid,uuid),public.website_platform_list(integer) to authenticated;
commit;
