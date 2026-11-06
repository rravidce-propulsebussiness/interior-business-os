begin;

-- One row per connected number, not per WhatsApp Business Account. A number can
-- be live in only one company at a time, but a disconnected row no longer blocks
-- another company. Disconnected rows stay because message history points at them.
alter table public.whatsapp_business_connections
  drop constraint whatsapp_business_connections_waba_id_key,
  drop constraint whatsapp_business_connections_organization_id_waba_id_key,
  add constraint whatsapp_connections_org_phone_unique unique (organization_id, phone_number_id);

create unique index whatsapp_connections_active_phone
  on public.whatsapp_business_connections(phone_number_id)
  where status = 'connected';

create index whatsapp_connections_waba_status
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

  if exists (
    select 1 from public.whatsapp_business_connections c
    where c.phone_number_id = p_phone_number_id
      and c.status = 'connected'
      and c.organization_id <> p_organization_id
  ) then
    raise exception 'WhatsApp number is connected to another workspace' using errcode = '23505';
  end if;

  insert into public.whatsapp_business_connections (
    organization_id, waba_id, business_name, phone_number_id,
    display_phone_number, verified_name, token_ciphertext, token_iv, token_tag,
    status, last_connected_at, updated_at
  ) values (
    p_organization_id, p_waba_id, coalesce(p_business_name, ''),
    p_phone_number_id, nullif(p_display_phone_number, ''),
    nullif(p_verified_name, ''), p_token_ciphertext, p_token_iv, p_token_tag,
    'connected', now(), now()
  )
  on conflict (organization_id, phone_number_id) do update set
    waba_id = excluded.waba_id,
    business_name = excluded.business_name,
    display_phone_number = excluded.display_phone_number,
    verified_name = excluded.verified_name,
    token_ciphertext = excluded.token_ciphertext,
    token_iv = excluded.token_iv,
    token_tag = excluded.token_tag,
    status = 'connected',
    last_connected_at = now(),
    updated_at = now()
  returning id into result;
  return result;
end;
$$;

commit;
