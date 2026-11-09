-- WhatsApp Business-style labels and broadcasts.
-- Labels group chats ("Hot lead", "2BHK"). Broadcasts send one approved
-- template to labelled, opted-in contacts and track every recipient.
-- All tables are service-role only; API routes enforce workspace permissions.
begin;

create table if not exists public.whatsapp_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#88352B' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index if not exists whatsapp_labels_name
  on public.whatsapp_labels(organization_id, lower(name));

create table if not exists public.whatsapp_contact_labels (
  organization_id uuid not null,
  contact_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, label_id),
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade,
  foreign key (organization_id, label_id)
    references public.whatsapp_labels(organization_id, id) on delete cascade
);
create index if not exists whatsapp_contact_labels_label
  on public.whatsapp_contact_labels(organization_id, label_id);

create table if not exists public.whatsapp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  template_name text not null check (template_name ~ '^[a-z0-9_]{1,512}$'),
  language text not null check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  parameters jsonb not null default '[]'::jsonb check (jsonb_typeof(parameters) = 'array'),
  label_ids uuid[] not null default '{}',
  status text not null default 'sending' check (status in ('sending','completed','cancelled')),
  total integer not null default 0,
  skipped integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references public.whatsapp_business_connections(organization_id, id) on delete cascade
);
create index if not exists whatsapp_broadcasts_recent
  on public.whatsapp_broadcasts(organization_id, connection_id, created_at desc);

create table if not exists public.whatsapp_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  broadcast_id uuid not null,
  contact_id uuid not null,
  wa_id text not null check (wa_id ~ '^[0-9]{5,32}$'),
  display_name text not null default '',
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  provider_message_id text,
  error_code text not null default '',
  sent_at timestamptz,
  unique (broadcast_id, contact_id),
  foreign key (organization_id, broadcast_id)
    references public.whatsapp_broadcasts(organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade
);
create index if not exists whatsapp_broadcast_recipients_queue
  on public.whatsapp_broadcast_recipients(broadcast_id, status);

do $$ declare t text; begin
  foreach t in array array['whatsapp_labels','whatsapp_contact_labels','whatsapp_broadcasts','whatsapp_broadcast_recipients'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Claim the next batch of queued recipients atomically so two open tabs never
-- send the same message twice.
create or replace function public.whatsapp_broadcast_claim(p_organization_id uuid, p_broadcast_id uuid, p_limit integer)
returns setof public.whatsapp_broadcast_recipients
language sql security definer set search_path = '' as $$
  update public.whatsapp_broadcast_recipients r
  set status = 'sending'
  where r.id in (
    select x.id from public.whatsapp_broadcast_recipients x
    join public.whatsapp_broadcasts b on b.id = x.broadcast_id and b.organization_id = x.organization_id
    where x.organization_id = p_organization_id and x.broadcast_id = p_broadcast_id
      and x.status = 'queued' and b.status = 'sending'
    order by x.id
    limit least(greatest(p_limit, 1), 50)
    for update of x skip locked
  )
  returning r.*;
$$;
revoke all on function public.whatsapp_broadcast_claim(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_claim(uuid,uuid,integer) to service_role;

commit;
