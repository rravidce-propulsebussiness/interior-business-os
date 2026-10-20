-- Additive R2 migration: existing project media remains readable in PostgreSQL.
-- Apply before enabling BUSINESS_OS_R2_ENABLED. Never drop bytes during the cutover.
begin;

alter table private.site_media
  add column if not exists r2_key text,
  add column if not exists r2_byte_size integer,
  add column if not exists r2_sha256 text;

create unique index if not exists site_media_r2_key_uniq
  on private.site_media(r2_key) where r2_key is not null;

-- All existing phase, role, category, agreement, curing, and count checks
-- continue to run in the original project_site_media_put function.
create or replace function public.project_site_media_put_r2(
  p_organization_id uuid,
  p_project_id uuid,
  p_category text,
  p_filename text,
  p_mime text,
  p_caption text,
  p_r2_key text,
  p_byte_size integer,
  p_sha256 text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_probe text;
  v_prefix text;
begin
  v_prefix := 'site/' || p_organization_id::text || '/' || p_project_id::text || '/';
  if p_r2_key is null or left(p_r2_key,length(v_prefix)) <> v_prefix
     or p_r2_key !~ '^site/[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]{36}$'
     or p_byte_size < 1 or p_byte_size > 8388608
     or p_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid R2 object metadata' using errcode='22023';
  end if;
  v_probe := case p_mime
    when 'image/jpeg' then '/9g='
    when 'image/png' then 'iVBORw=='
    when 'image/webp' then 'UklGRg=='
    when 'video/mp4' then 'AAAAAGZ0eXA='
    when 'application/pdf' then 'JVBERg=='
    else null
  end;
  if v_probe is null then
    raise exception 'Invalid media type' using errcode='22023';
  end if;

  -- Deliberately reuse existing audited RBAC and validation logic.
  v_id := public.project_site_media_put(
    p_organization_id,p_project_id,p_category,p_filename,p_mime,v_probe,p_caption
  );
  update private.site_media
     set bytes = ''::bytea, r2_key = p_r2_key,
         r2_byte_size = p_byte_size, r2_sha256 = p_sha256
   where id = v_id and organization_id = p_organization_id
     and project_id = p_project_id;
  return v_id;
end $$;

-- The original private media access check runs before revealing an R2 key.
create or replace function public.project_site_media_r2_key(
  p_organization_id uuid,
  p_project_id uuid,
  p_id uuid
) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_key text;
begin
  perform public.project_site_media_get(p_organization_id,p_project_id,p_id);
  select m.r2_key into v_key from private.site_media m
   where m.organization_id=p_organization_id
     and m.project_id=p_project_id and m.id=p_id;
  return v_key;
end $$;

revoke all on function public.project_site_media_put_r2(
 uuid,uuid,text,text,text,text,text,integer,text
) from public, anon;
grant execute on function public.project_site_media_put_r2(
 uuid,uuid,text,text,text,text,text,integer,text
) to authenticated;
revoke all on function public.project_site_media_r2_key(uuid,uuid,uuid)
 from public, anon;
grant execute on function public.project_site_media_r2_key(uuid,uuid,uuid)
 to authenticated;
commit;
