begin;

-- Upgrade both legacy WABA-scoped deployments and the earlier per-number
-- schema. Keep disconnected duplicates: inbox/history foreign keys use them.
alter table public.whatsapp_business_connections
  drop constraint if exists whatsapp_business_connections_waba_id_key,
  drop constraint if exists whatsapp_business_connections_organization_id_waba_id_key,
  drop constraint if exists whatsapp_connections_org_phone_unique;

create unique index if not exists whatsapp_connections_active_phone
  on public.whatsapp_business_connections(phone_number_id)
  where status = 'connected';
create index if not exists whatsapp_connections_org_phone_status
  on public.whatsapp_business_connections(organization_id, phone_number_id, status);
create index if not exists whatsapp_connections_waba_status
  on public.whatsapp_business_connections(waba_id, status);

create or replace function public.whatsapp_connection_save(
  p_organization_id uuid,
  p_waba_id text,
  p_business_name text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_token_ciphertext text,
  p_token_iv text,
  p_token_tag text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare result uuid;
begin
  perform private.require_permission(p_organization_id, 'automation.manage');
  if p_waba_id !~ '^[0-9]{5,32}$'
     or p_phone_number_id !~ '^[0-9]{5,32}$'
     or length(coalesce(p_business_name, '')) > 200
     or length(coalesce(p_display_phone_number, '')) > 80
     or length(coalesce(p_verified_name, '')) > 200
     or length(p_token_ciphertext) > 12000
     or length(p_token_iv) > 64
     or length(p_token_tag) > 64 then
    raise exception 'Invalid WhatsApp connection' using errcode = '22023';
  end if;

  -- Serialize reconnects to the same number, including across companies.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('whatsapp_phone:' || p_phone_number_id, 0)
  );
  if exists (
    select 1 from public.whatsapp_business_connections c
    where c.phone_number_id = p_phone_number_id
      and c.status = 'connected'
      and c.organization_id <> p_organization_id
  ) then
    raise exception 'WhatsApp number is connected to another workspace' using errcode = '23505';
  end if;

  -- Reuse this company's active/latest row so reconnecting retains its history.
  -- Earlier disconnected duplicate rows remain untouched.
  select c.id into result
  from public.whatsapp_business_connections c
  where c.organization_id = p_organization_id
    and c.phone_number_id = p_phone_number_id
  order by (c.status = 'connected') desc, c.updated_at desc, c.created_at desc, c.id
  limit 1
  for update;

  if result is null then
    insert into public.whatsapp_business_connections (
      organization_id, waba_id, business_name, phone_number_id,
      display_phone_number, verified_name, token_ciphertext, token_iv, token_tag,
      status, last_connected_at, updated_at
    ) values (
      p_organization_id, p_waba_id, coalesce(p_business_name, ''),
      p_phone_number_id, nullif(p_display_phone_number, ''),
      nullif(p_verified_name, ''), p_token_ciphertext, p_token_iv, p_token_tag,
      'connected', now(), now()
    ) returning id into result;
  else
    update public.whatsapp_business_connections set
      waba_id = p_waba_id,
      business_name = coalesce(p_business_name, ''),
      display_phone_number = nullif(p_display_phone_number, ''),
      verified_name = nullif(p_verified_name, ''),
      token_ciphertext = p_token_ciphertext,
      token_iv = p_token_iv,
      token_tag = p_token_tag,
      status = 'connected',
      last_connected_at = now(),
      updated_at = now()
    where id = result;
  end if;
  return result;
end;
$$;
revoke all on function public.whatsapp_connection_save(uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.whatsapp_connection_save(uuid,text,text,text,text,text,text,text,text) to authenticated;

commit;
