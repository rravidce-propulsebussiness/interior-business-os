-- Follow-up to the already deployed billing-queue migration.
-- Serialise claims on the broadcast row, so concurrent browser tabs cannot
-- start two probes or overlap a multi-recipient batch.
begin;

create or replace function public.whatsapp_broadcast_claim(
  p_organization_id uuid, p_broadcast_id uuid, p_limit integer
)
returns setof public.whatsapp_broadcast_recipients
language plpgsql security definer set search_path = '' as $$
declare current_status text;
declare current_probe text;
declare batch_size integer;
begin
  -- Row-level lock serialises the decision and claim in a single DB RPC.
  select b.status, b.probe_message_id
  into current_status, current_probe
  from public.whatsapp_broadcasts b
  where b.organization_id = p_organization_id and b.id = p_broadcast_id
  for update;

  if current_status is null
     or current_status not in ('verifying', 'sending')
  then return; end if;

  -- Any unresolved send prevents further work. In particular, an accepted
  -- verification message must receive a delivered/read webhook before
  -- we claim more people. Never use a timeout to infer delivery.
  if exists (
    select 1 from public.whatsapp_broadcast_recipients r
    where r.organization_id = p_organization_id
      and r.broadcast_id = p_broadcast_id
      and r.status = 'sending'
  ) then return; end if;

  if current_status = 'verifying'
    and (current_probe is not null or exists (
      select 1 from public.whatsapp_broadcast_recipients r
      where r.organization_id = p_organization_id
        and r.broadcast_id = p_broadcast_id
        and r.status = 'sent'
    ))
  then return; end if;

  batch_size := case
    when current_status = 'verifying' then 1
    else least(greatest(p_limit, 1), 20)
  end;

  return query
  update public.whatsapp_broadcast_recipients r
  set status = 'sending'
  where r.id in (
    select x.id from public.whatsapp_broadcast_recipients x
    where x.organization_id = p_organization_id
      and x.broadcast_id = p_broadcast_id
      and x.status = 'queued'
    order by x.retry_count desc, x.id
    limit batch_size
    for update skip locked
  )
  returning r.*;
end;
$$;
revoke all on function public.whatsapp_broadcast_claim(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_claim(uuid,uuid,integer)
  to service_role;

-- Nonbilling/uncertain failures must pause an active sending campaign too.
-- They must not leave it in 'sending' while an unknown Meta result is in flight.
create or replace function public.whatsapp_broadcast_pause(
  p_organization_id uuid, p_broadcast_id uuid, p_billing boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare selected_connection uuid;
declare selected_waba text;
begin
  select b.connection_id, c.waba_id
  into selected_connection, selected_waba
  from public.whatsapp_broadcasts b
  join public.whatsapp_business_connections c
    on c.id = b.connection_id and c.organization_id = b.organization_id
  where b.organization_id = p_organization_id and b.id = p_broadcast_id;

  if selected_connection is null then return; end if;

  if p_billing then
    update public.whatsapp_broadcasts b
    set status = 'paused_billing'
    where b.organization_id = p_organization_id
      and b.status in ('verifying','sending')
      and b.connection_id in (
        select c.id from public.whatsapp_business_connections c
        where c.organization_id = p_organization_id
          and c.waba_id = selected_waba
      );
  else
    update public.whatsapp_broadcasts b
    set status = 'paused_error'
    where b.organization_id = p_organization_id
      and b.id = p_broadcast_id
      and b.status in ('verifying','sending');
  end if;
end;
$$;
revoke all on function public.whatsapp_broadcast_pause(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_pause(uuid,uuid,boolean)
  to service_role;

commit;
