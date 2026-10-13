-- Link a verified ProPulse OAuth identity to exactly one owned Business OS tenant.
-- Neither matching emails nor matching company names grant workspace membership.
begin;

create table public.organization_propulse_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id),
  propulse_subject text not null unique check (propulse_subject ~ '^propulse:[0-9]{1,19}$'),
  source_profile_id text not null,
  phone text not null default '',
  description text not null default '',
  services jsonb not null default '[]'::jsonb check (jsonb_typeof(services)='array'),
  locations jsonb not null default '[]'::jsonb check (jsonb_typeof(locations)='array'),
  last_synced_at timestamptz not null default now()
);
alter table public.organization_propulse_profiles enable row level security;
alter table public.organization_propulse_profiles force row level security;
revoke all on public.organization_propulse_profiles from public,anon,authenticated;
grant select on public.organization_propulse_profiles to authenticated;
create policy organization_propulse_profiles_read
 on public.organization_propulse_profiles for select to authenticated
 using (private.is_member(organization_id));

create function public.company_propulse_sync(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $sync$
declare
 v_user uuid := (select auth.uid());
 v_subject text := trim(coalesce(p_input->>'sub',''));
 v_profile jsonb := p_input->'company';
 v_name text;
 v_source text;
 v_description text;
 v_phone text;
 v_services jsonb;
 v_locations jsonb;
 v_keys text[];
 v_slug text;
 v_owner uuid;
 v_org uuid;
 v_count integer;
 v_created jsonb;
begin
 if not private.is_active_user() or not exists (
   select 1 from auth.users where id=v_user and email_confirmed_at is not null
 ) then raise exception 'Verified login required' using errcode='42501'; end if;
 if jsonb_typeof(p_input) is distinct from 'object'
   or octet_length(p_input::text)>16000
   or v_subject !~ '^propulse:[0-9]{1,19}$'
   or not exists (
     select 1 from auth.identities i
     where i.user_id=v_user
       and i.provider='custom:propulse-business'
       and i.identity_data->>'sub'=v_subject
       and i.identity_data->>'email_verified'='true'
   )
 then raise exception 'ProPulse identity mismatch' using errcode='42501';end if;

 if jsonb_typeof(v_profile) is distinct from 'object' then
   return jsonb_build_object('status','missing_profile');
 end if;
 v_name:=trim(coalesce(v_profile->>'name',''));
 v_source:=trim(coalesce(v_profile->>'source_id',''));
 v_description:=trim(coalesce(v_profile->>'description',''));
 v_phone:=trim(coalesce(v_profile->>'phone',''));
 v_services:=coalesce(v_profile->'services','[]'::jsonb);
 v_locations:=coalesce(v_profile->'locations','[]'::jsonb);
 if length(v_name) not between 2 and 200
   or v_source !~ '^[0-9]{1,19}$'
   or length(v_description)>2000 or length(v_phone)>40
   or jsonb_typeof(v_services)<>'array' or jsonb_array_length(v_services)>30
   or jsonb_typeof(v_locations)<>'array' or jsonb_array_length(v_locations)>30
 then raise exception 'Invalid ProPulse business profile' using errcode='22023';end if;

 -- The identity is globally unique and never transferable across users.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('business-os-propulse:'||v_subject,0)
 );
 select organization_id,owner_user_id into v_org,v_owner
   from public.organization_propulse_profiles
   where propulse_subject=v_subject for update;
 if v_org is not null and v_owner<>v_user then
   raise exception 'ProPulse identity already linked to another user' using errcode='42501';
 end if;
 if v_org is null then
   -- Only reuse a tenant already created and owned by this same authenticated
   -- account. Multiple possible tenants must be selected explicitly.
   select count(*),min(o.id) into v_count,v_org
     from public.organizations o
     join public.organization_memberships m
       on m.organization_id=o.id and m.user_id=v_user and m.status='active'
     join public.membership_roles mr
       on mr.organization_id=o.id and mr.membership_id=m.id
     join public.roles r on r.id=mr.role_id and r.organization_id=o.id and r.is_owner
     where o.created_by=v_user and o.status in ('active','trial')
       and not exists (select 1 from public.organization_propulse_profiles pp
                       where pp.organization_id=o.id);
   if v_count>1 then return jsonb_build_object('status','choose_existing');end if;
   if v_count=0 then
     -- Stable unique slug: never claim another organization's name-based URL.
     v_slug:=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
     if length(v_slug)=0 then v_slug:='propulse-business';end if;
     v_slug:=left(v_slug,57)||'-p'||substring(v_subject from 9);
     if length(v_slug)>80 then raise exception 'Invalid company slug' using errcode='22023';end if;
     select array_agg(distinct i.key order by i.key) into v_keys
     from public.industries i
     where i.status='active' and (
       (i.key='interior' and exists(select 1 from jsonb_array_elements(v_services) s
         where lower(s->>'industry') like '%interior%'))
       or (i.key='construction' and exists(select 1 from jsonb_array_elements(v_services) s
         where lower(s->>'industry') like '%construct%'))
     );
     -- The available Business OS industries are currently construction/interior;
     -- profiles from other sectors need the owner to select a supported industry.
     if coalesce(cardinality(v_keys),0)=0 then
       return jsonb_build_object('status','choose_industry');
     end if;
     v_created:=public.company_self_register(jsonb_build_object(
       'name',v_name,'slug',v_slug,'legalName','','country','IN',
       'currency','INR','timezone','Asia/Kolkata','industries',to_jsonb(v_keys)
     ));
     if v_created->>'status'<>'approved' then return v_created;end if;
     v_org:=(v_created->>'organizationId')::uuid;
   end if;
   insert into public.organization_propulse_profiles(
     organization_id,owner_user_id,propulse_subject,source_profile_id,
     phone,description,services,locations
   ) values (v_org,v_user,v_subject,v_source,v_phone,v_description,v_services,v_locations);
 else
   -- Never revive suspended tenants or grant membership from a provider claim.
   if not exists (
     select 1 from public.organizations o
     join public.organization_memberships m on m.organization_id=o.id
       and m.user_id=v_user and m.status='active'
     join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=o.id
     join public.roles r on r.id=mr.role_id and r.is_owner and r.organization_id=o.id
     where o.id=v_org and o.created_by=v_user and o.status in ('active','trial')
   ) then raise exception 'Linked company access has been revoked' using errcode='42501';end if;
   update public.organization_propulse_profiles
     set source_profile_id=v_source,phone=v_phone,description=v_description,
         services=v_services,locations=v_locations,last_synced_at=now()
     where organization_id=v_org and owner_user_id=v_user
       and propulse_subject=v_subject;
 end if;
 -- ProPulse remains the source of truth for the display name only.
 -- Never replace legal/GST names, tenant slug, billing or administrator roles.
 update public.organizations set name=v_name where id=v_org and created_by=v_user;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(v_user,v_org,'company.propulse.synced','organization',v_org::text,
        jsonb_build_object('subject',v_subject,'sourceProfileId',v_source));
 return jsonb_build_object('status','approved','organizationId',v_org);
end $sync$;

revoke all on function public.company_propulse_sync(jsonb) from public,anon,authenticated;
grant execute on function public.company_propulse_sync(jsonb) to authenticated;
commit;
