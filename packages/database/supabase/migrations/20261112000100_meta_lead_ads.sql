-- Meta (Facebook/Instagram) Lead Ads as a direct CRM lead source.
--
-- A company owner connects their Facebook Pages, links lead forms, and Meta
-- pushes each submitted lead to the Business App webhook. The server fetches
-- the lead once and calls meta_lead_ingest. Optionally the lead then receives
-- an approved WhatsApp template asking them to confirm their form details;
-- when they reply YES the company's indicative quotation message is sent.
--
-- Page tokens are encrypted by the server before they reach this schema and
-- every table here is server-only: there are no authenticated RLS policies and
-- the functions are executable by service_role alone.
begin;

create table public.meta_lead_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_id text not null check (page_id ~ '^[0-9]{5,32}$'),
  page_name text not null default '' check (length(page_name) <= 255),
  token_ciphertext text not null check (length(token_ciphertext) <= 12000),
  token_iv text not null check (length(token_iv) <= 64),
  token_tag text not null check (length(token_tag) <= 64),
  connected_by uuid not null references auth.users(id),
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, page_id),
  unique (organization_id, id)
);

create table public.meta_lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_row_id uuid not null,
  page_id text not null check (page_id ~ '^[0-9]{5,32}$'),
  form_id text not null check (form_id ~ '^[0-9]{5,32}$'),
  form_name text not null default '' check (length(form_name) <= 255),
  status text not null default 'active' check (status in ('active','disabled')),
  -- WhatsApp follow-up. The connection is validated when saved and when used;
  -- there is deliberately no foreign key so removing a number never blocks.
  whatsapp_connection_id uuid,
  confirm_enabled boolean not null default false,
  template_name text not null default '' check (template_name = '' or (template_name ~ '^[a-z0-9_]+$' and length(template_name) between 3 and 512)),
  template_language text not null default '' check (template_language = '' or template_language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  -- How many body placeholders the chosen template has: {{1}} lead name,
  -- {{2}} submitted details, {{3}} company name.
  template_parameters smallint not null default 0 check (template_parameters between 0 and 3),
  quote_enabled boolean not null default false,
  quote_message text not null default '' check (length(quote_message) <= 1500),
  default_country_code text not null default '91' check (default_country_code ~ '^[1-9][0-9]{0,3}$'),
  leads_received integer not null default 0 check (leads_received >= 0),
  leads_created integer not null default 0 check (leads_created >= 0),
  leads_duplicate integer not null default 0 check (leads_duplicate >= 0),
  leads_failed integer not null default 0 check (leads_failed >= 0),
  last_lead_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  last_error_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, page_row_id)
    references public.meta_lead_pages(organization_id, id) on delete cascade,
  check (not confirm_enabled or (whatsapp_connection_id is not null and template_name <> '' and template_language <> '')),
  check (not quote_enabled or confirm_enabled)
);
-- A lead form feeds exactly one company at a time.
create unique index meta_lead_forms_active_form on public.meta_lead_forms(form_id) where status = 'active';
create index meta_lead_forms_org on public.meta_lead_forms(organization_id, created_at desc);

create table public.meta_lead_events (
  leadgen_id text primary key check (leadgen_id ~ '^[0-9]{5,32}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_row_id uuid not null,
  lead_id uuid,
  status text not null default 'received' check (status in ('received','imported','duplicate','failed')),
  error text check (error is null or length(error) <= 500),
  attempts integer not null default 0 check (attempts >= 0),
  whatsapp_connection_id uuid,
  wa_id text check (wa_id is null or wa_id ~ '^[0-9]{8,15}$'),
  whatsapp_status text not null default 'none'
    check (whatsapp_status in ('none','skipped','awaiting_confirmation','replied','confirmed','quote_sent','failed')),
  whatsapp_error text check (whatsapp_error is null or length(whatsapp_error) <= 500),
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (organization_id, form_row_id)
    references public.meta_lead_forms(organization_id, id) on delete cascade
);
create index meta_lead_events_form on public.meta_lead_events(organization_id, form_row_id, created_at desc);
create index meta_lead_events_awaiting on public.meta_lead_events(organization_id, wa_id, confirmation_sent_at desc)
  where whatsapp_status = 'awaiting_confirmation';

alter table public.meta_lead_pages enable row level security;
alter table public.meta_lead_pages force row level security;
alter table public.meta_lead_forms enable row level security;
alter table public.meta_lead_forms force row level security;
alter table public.meta_lead_events enable row level security;
alter table public.meta_lead_events force row level security;
revoke all on public.meta_lead_pages, public.meta_lead_forms, public.meta_lead_events from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.meta_lead_pages, public.meta_lead_forms, public.meta_lead_events to service_role';
  end if;
end $$;
comment on table public.meta_lead_pages is
  'Service-role only: encrypted Facebook Page tokens for Meta Lead Ads. Never expose token columns to clients.';

create trigger meta_lead_pages_touch before update on public.meta_lead_pages
  for each row execute function private.touch_updated_at();
create trigger meta_lead_forms_touch before update on public.meta_lead_forms
  for each row execute function private.touch_updated_at();

-- Import one Meta lead. Idempotent per Meta lead ID: a webhook retry or a
-- manual re-import never creates a second CRM lead.
create function public.meta_lead_ingest(
  p_organization_id uuid, p_form_row_id uuid, p_leadgen_id text, p_input jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.meta_lead_forms;
  v_claimed text;
  v_name text; v_phone text; v_email text; v_wa text;
  v_source uuid; v_stage uuid; v_lead uuid; v_number text;
  v_year integer; v_counter bigint; v_prefix text;
  v_status text; v_error text;
begin
  if p_leadgen_id is null or p_leadgen_id !~ '^[0-9]{5,32}$'
     or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 24000 then
    raise exception 'Invalid Meta lead' using errcode = '22023';
  end if;
  select * into f from public.meta_lead_forms
    where organization_id = p_organization_id and id = p_form_row_id and status = 'active' for update;
  if f.id is null then raise exception 'Lead form is not connected' using errcode = '22023'; end if;

  insert into public.meta_lead_events(leadgen_id, organization_id, form_row_id, status, attempts)
    values (p_leadgen_id, p_organization_id, f.id, 'received', 1)
    on conflict (leadgen_id) do update set attempts = public.meta_lead_events.attempts + 1, status = 'received'
      where public.meta_lead_events.organization_id = excluded.organization_id
        and public.meta_lead_events.status in ('received','failed')
    returning leadgen_id into v_claimed;
  if v_claimed is null then return jsonb_build_object('status', 'already_processed'); end if;

  v_name := left(btrim(coalesce(p_input->>'name', '')), 200);
  v_phone := private.normalize_crm_phone(coalesce(p_input->>'phone', ''));
  v_email := lower(btrim(coalesce(p_input->>'email', '')));
  v_wa := nullif(p_input->>'wa_id', '');
  if v_name = '' then v_name := 'Meta lead'; end if;

  if not private.entitled(p_organization_id, 'crm') then
    v_error := 'CRM is not enabled for this company';
  elsif v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$' then
    v_error := 'The lead form did not include a valid phone number';
  elsif length(v_email) > 254 or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    v_email := '';
  end if;
  if v_wa is not null and v_wa !~ '^[0-9]{8,15}$' then v_wa := null; end if;

  if v_error is null then
    insert into public.lead_sources(organization_id, key, name)
      values (p_organization_id, 'meta_lead_ads', 'Meta Lead Ads')
      on conflict (organization_id, key) do nothing;
    select id into v_source from public.lead_sources
      where organization_id = p_organization_id and key = 'meta_lead_ads';
    select id into v_stage from public.crm_pipeline_stages
      where organization_id = p_organization_id and active and outcome = 'open'
      order by sort_order, id limit 1;
    if v_stage is null then v_error := 'Set up CRM pipeline stages before receiving Meta leads'; end if;
  end if;

  if v_error is null then
    select id, lead_number into v_lead, v_number from public.leads
      where organization_id = p_organization_id and lifecycle <> 'archived'
        and (phone_normalized = v_phone or (v_email <> '' and email_normalized = v_email))
      order by created_at, id limit 1;
    if v_lead is not null then
      v_status := 'duplicate';
      perform private.crm_event(p_organization_id, v_lead, 'system',
        'Submitted a Meta lead form again: ' || left(f.form_name, 200),
        jsonb_build_object('meta_leadgen_id', p_leadgen_id, 'meta_form_id', f.form_id));
    else
      v_year := extract(year from current_date);
      insert into private.lead_number_sequences(organization_id, year, last_number)
        values (p_organization_id, v_year, 1)
        on conflict (organization_id, year) do update
          set last_number = private.lead_number_sequences.last_number + 1
        returning last_number, private.lead_number_sequences.prefix into v_counter, v_prefix;
      v_number := v_prefix || '-' || v_year || '-' || lpad(v_counter::text, 6, '0');
      insert into public.leads(
        organization_id, lead_number, name, phone, email, source_id, source_detail, stage_id,
        location, service_type, project_size, notes
      ) values (
        p_organization_id, v_number, v_name, v_phone, v_email, v_source,
        left('meta:' || p_leadgen_id || ' / ' || f.form_name, 500), v_stage,
        left(coalesce(p_input->>'location', ''), 500),
        left(coalesce(p_input->>'service_type', ''), 200),
        left(coalesce(p_input->>'project_size', ''), 200),
        left(coalesce(p_input->>'notes', ''), 10000)
      ) returning id into v_lead;
      v_status := 'imported';
      perform private.crm_event(p_organization_id, v_lead, 'system',
        'Lead received from Meta lead form: ' || left(f.form_name, 200),
        jsonb_build_object('meta_leadgen_id', p_leadgen_id, 'meta_form_id', f.form_id,
          'meta_platform', left(coalesce(p_input->>'platform', ''), 40)));
    end if;
  else
    v_status := 'failed';
  end if;

  update public.meta_lead_events set
    status = v_status, error = v_error, lead_id = v_lead, wa_id = v_wa, processed_at = now()
    where leadgen_id = p_leadgen_id;
  update public.meta_lead_forms set
    leads_received = leads_received + 1,
    leads_created = leads_created + (v_status = 'imported')::integer,
    leads_duplicate = leads_duplicate + (v_status = 'duplicate')::integer,
    leads_failed = leads_failed + (v_status = 'failed')::integer,
    last_lead_at = now(),
    last_error = case when v_status = 'failed' then v_error else last_error end,
    last_error_at = case when v_status = 'failed' then now() else last_error_at end
    where id = f.id;

  return jsonb_build_object(
    'status', v_status, 'error', v_error, 'lead_id', v_lead, 'lead_number', v_number,
    'lead_name', v_name, 'wa_id', v_wa,
    'company_name', (select name from public.organizations where id = p_organization_id));
end $$;

-- Record what happened to the WhatsApp details-confirmation template.
create function public.meta_lead_confirmation_logged(
  p_organization_id uuid, p_leadgen_id text, p_connection_id uuid, p_sent boolean, p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.meta_lead_events;
begin
  select * into e from public.meta_lead_events
    where organization_id = p_organization_id and leadgen_id = p_leadgen_id for update;
  if e.leadgen_id is null then return; end if;
  update public.meta_lead_events set
    whatsapp_connection_id = p_connection_id,
    whatsapp_status = case when p_sent then 'awaiting_confirmation' else 'failed' end,
    whatsapp_error = case when p_sent then null else left(coalesce(p_error, 'WhatsApp message was not sent'), 500) end,
    confirmation_sent_at = case when p_sent then now() else confirmation_sent_at end
    where leadgen_id = e.leadgen_id;
  if e.lead_id is not null then
    perform private.crm_event(p_organization_id, e.lead_id, 'system',
      case when p_sent then 'WhatsApp sent automatically: asked the lead to confirm their form details'
           else 'Automatic WhatsApp confirmation was not sent: ' || left(coalesce(p_error, 'unknown reason'), 300) end,
      jsonb_build_object('meta_leadgen_id', p_leadgen_id));
  end if;
end $$;

-- Called for every inbound WhatsApp message. Returns null when this contact
-- has no pending details confirmation, so ordinary automations continue.
create function public.meta_lead_reply(
  p_organization_id uuid, p_connection_id uuid, p_wa_id text, p_text text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.meta_lead_events; f public.meta_lead_forms; l public.leads;
  v_answer text; v_packages jsonb;
begin
  if p_wa_id is null or p_wa_id !~ '^[0-9]{8,15}$' then return null; end if;
  select * into e from public.meta_lead_events
    where organization_id = p_organization_id and wa_id = p_wa_id
      and whatsapp_connection_id = p_connection_id
      and whatsapp_status = 'awaiting_confirmation'
      and confirmation_sent_at > now() - interval '7 days'
    order by confirmation_sent_at desc limit 1 for update;
  if e.leadgen_id is null then return null; end if;
  select * into f from public.meta_lead_forms where id = e.form_row_id;
  select * into l from public.leads where organization_id = p_organization_id and id = e.lead_id;

  v_answer := upper(regexp_replace(btrim(coalesce(p_text, '')), '[[:space:].!]+$', ''));
  if v_answer not in ('YES','Y','YA','YEAH','YEP','CONFIRM','CONFIRMED','CORRECT','OK','OKAY','RIGHT','1','HA','HAAN','HAN','AVUNU','SARI') then
    update public.meta_lead_events set whatsapp_status = 'replied' where leadgen_id = e.leadgen_id;
    if l.id is not null then
      perform private.crm_event(p_organization_id, l.id, 'system',
        'Lead replied on WhatsApp instead of confirming their form details: ' || left(coalesce(p_text, ''), 1000),
        jsonb_build_object('meta_leadgen_id', e.leadgen_id));
    end if;
    return jsonb_build_object('action', 'replied');
  end if;

  update public.meta_lead_events set whatsapp_status = 'confirmed', confirmed_at = now()
    where leadgen_id = e.leadgen_id;
  if l.id is not null then
    perform private.crm_event(p_organization_id, l.id, 'system',
      'Lead confirmed their form details on WhatsApp',
      jsonb_build_object('meta_leadgen_id', e.leadgen_id));
  end if;
  if not f.quote_enabled or f.status <> 'active' then
    return jsonb_build_object('action', 'confirmed', 'leadgen_id', e.leadgen_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'rate_per_sqft', p.rate_per_sqft)
           order by p.rate_per_sqft, p.name), '[]'::jsonb)
    into v_packages
    from private.construction_quote_packages p
    where p.organization_id = p_organization_id and p.status = 'active';
  return jsonb_build_object(
    'action', 'send_quote', 'leadgen_id', e.leadgen_id,
    'lead_name', coalesce(l.name, ''), 'project_size', coalesce(l.project_size, ''),
    'quote_message', f.quote_message, 'packages', v_packages,
    'company_name', (select name from public.organizations where id = p_organization_id));
end $$;

-- Record that the indicative quotation message was (or was not) delivered.
create function public.meta_lead_quote_logged(
  p_organization_id uuid, p_leadgen_id text, p_sent boolean, p_body text default '', p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.meta_lead_events;
begin
  select * into e from public.meta_lead_events
    where organization_id = p_organization_id and leadgen_id = p_leadgen_id for update;
  if e.leadgen_id is null or e.whatsapp_status <> 'confirmed' then return; end if;
  update public.meta_lead_events set
    whatsapp_status = case when p_sent then 'quote_sent' else 'confirmed' end,
    whatsapp_error = case when p_sent then null else left(coalesce(p_error, 'Quotation message was not sent'), 500) end
    where leadgen_id = e.leadgen_id;
  if e.lead_id is not null then
    perform private.crm_event(p_organization_id, e.lead_id, 'system',
      case when p_sent then 'Indicative quotation shared automatically on WhatsApp: ' || left(coalesce(p_body, ''), 1500)
           else 'Automatic quotation message was not sent: ' || left(coalesce(p_error, 'unknown reason'), 300) end,
      jsonb_build_object('meta_leadgen_id', p_leadgen_id));
  end if;
end $$;

revoke all on function public.meta_lead_ingest(uuid, uuid, text, jsonb),
  public.meta_lead_confirmation_logged(uuid, text, uuid, boolean, text),
  public.meta_lead_reply(uuid, uuid, text, text),
  public.meta_lead_quote_logged(uuid, text, boolean, text, text)
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.meta_lead_ingest(uuid, uuid, text, jsonb),
      public.meta_lead_confirmation_logged(uuid, text, uuid, boolean, text),
      public.meta_lead_reply(uuid, uuid, text, text),
      public.meta_lead_quote_logged(uuid, text, boolean, text, text) to service_role';
  end if;
end $$;

commit;
