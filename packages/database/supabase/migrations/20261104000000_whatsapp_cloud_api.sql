begin;

create table public.whatsapp_business_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id text not null unique check (waba_id ~ '^[0-9]{5,32}$'),
  business_name text not null default '',
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,32}$'),
  display_phone_number text,
  verified_name text,
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  last_connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, waba_id)
);

create index whatsapp_connections_org on public.whatsapp_business_connections(organization_id, created_at desc);
alter table public.whatsapp_business_connections enable row level security;
alter table public.whatsapp_business_connections force row level security;
revoke all on public.whatsapp_business_connections from public, anon, authenticated;
grant select (id, organization_id, waba_id, business_name, phone_number_id, display_phone_number, verified_name, status, last_connected_at, created_at, updated_at)
  on public.whatsapp_business_connections to authenticated;
create policy whatsapp_connections_read on public.whatsapp_business_connections
  for select to authenticated using (private.has_permission(organization_id, 'automation.view'));

create function public.whatsapp_connection_save(
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
  on conflict (organization_id, waba_id) do update set
    business_name = excluded.business_name,
    phone_number_id = excluded.phone_number_id,
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
revoke all on function public.whatsapp_connection_save(uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.whatsapp_connection_save(uuid,text,text,text,text,text,text,text,text) to authenticated;

create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id text not null check (waba_id ~ '^[0-9]{5,32}$'),
  idempotency_key text not null unique check (idempotency_key ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  processed_at timestamptz,
  unique (organization_id, id)
);
create index whatsapp_webhook_events_pending on public.whatsapp_webhook_events(received_at, id) where processed_at is null;
create index whatsapp_webhook_events_retention on public.whatsapp_webhook_events(expires_at);
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_webhook_events force row level security;
revoke all on public.whatsapp_webhook_events from public, anon, authenticated;
grant all on public.whatsapp_webhook_events to service_role;

commit;
