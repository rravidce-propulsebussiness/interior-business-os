-- Payment-aware WhatsApp broadcast queue. Run this migration before deploying the
-- route/UI changes. Only service_role may invoke the mutation functions.
begin;

alter table public.whatsapp_broadcasts
  drop constraint if exists whatsapp_broadcasts_status_check;
alter table public.whatsapp_broadcasts
  add constraint whatsapp_broadcasts_status_check
  check (status in ('verifying','sending','paused_billing','paused_error','completed','cancelled'));

alter table public.whatsapp_broadcast_recipients
  add column if not exists retry_count integer not null default 0;
alter table public.whatsapp_broadcast_recipients
  drop constraint if exists whatsapp_broadcast_recipients_retry_count_check;
alter table public.whatsapp_broadcast_recipients
  add constraint whatsapp_broadcast_recipients_retry_count_check
  check (retry_count between 0 and 3);

-- All new campaigns verify ONE real message before the rest of the queue.
-- A second tab cannot claim another probe while the first is in flight.
create or replace function public.whatsapp_broadcast_claim(
  p_organization_id uuid, p_broadcast_id uuid, p_limit integer
)
returns setof public.whatsapp_broadcast_recipients
language sql security definer set search_path = '' as $$
  update public.whatsapp_broadcast_recipients r
  set status = 'sending'
  where r.id in (
    select x.id from public.whatsapp_broadcast_recipients x
    join public.whatsapp_broadcasts b
      on b.id = x.broadcast_id and b.organization_id = x.organization_id
    where x.organization_id = p_organization_id
      and x.broadcast_id = p_broadcast_id
      and x.status = 'queued'
      and b.status in ('verifying','sending')
      and (
        b.status = 'sending'
        or not exists (
          select 1 from public.whatsapp_broadcast_recipients pending
          where pending.organization_id = x.organization_id
            and pending.broadcast_id = x.broadcast_id
            and pending.status in ('sending','sent')
        )
      )
    order by x.id
    limit case
      when (select b.status = 'verifying' from public.whatsapp_broadcasts b
            where b.organization_id = p_organization_id and b.id = p_broadcast_id)
      then 1
      else least(greatest(p_limit, 1), 20)
    end
    for update of x skip locked
  )
  returning r.*;
$$;
revoke all on function public.whatsapp_broadcast_claim(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_claim(uuid,uuid,integer)
  to service_role;

-- One WABA billing error pauses every active campaign on the affected
-- WABA within this organization; other WABAs continue normally.
create or replace function public.whatsapp_broadcast_pause(
  p_organization_id uuid, p_broadcast_id uuid, p_billing boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare selected_connection uuid; selected_waba text;
begin
  select b.connection_id, c.waba_id into selected_connection, selected_waba
  from public.whatsapp_broadcasts b
  join public.whatsapp_business_connections c
    on c.id = b.connection_id and c.organization_id = b.organization_id
  where b.organization_id = p_organization_id and b.id = p_broadcast_id;
  if selected_connection is null then return; end if;

  if p_billing then
    update public.whatsapp_broadcasts b set status = 'paused_billing'
    where b.organization_id = p_organization_id
      and b.status in ('verifying','sending')
      and b.connection_id in (
        select c.id from public.whatsapp_business_connections c
        where c.organization_id = p_organization_id and c.waba_id = selected_waba
      );
  else
    update public.whatsapp_broadcasts b set status = 'paused_error'
    where b.organization_id = p_organization_id and b.id = p_broadcast_id
      and b.status = 'verifying';
  end if;
end;
$$;
revoke all on function public.whatsapp_broadcast_pause(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_pause(uuid,uuid,boolean)
  to service_role;

-- Webhooks can report a billing failure AFTER the Send API returns an ID.
-- The matching provider ID is mandatory: stale receipts from prior attempts
-- must never alter a newer retry.
create or replace function public.whatsapp_broadcast_receipt(
  p_organization_id uuid, p_connection_id uuid,
  p_provider_message_id text, p_delivery_status text, p_error_code text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare target_broadcast uuid;
begin
  if p_provider_message_id is null or p_provider_message_id = ''
    or p_delivery_status not in ('sent','delivered','read','failed')
  then return; end if;

  select r.broadcast_id into target_broadcast
  from public.whatsapp_broadcast_recipients r
  join public.whatsapp_broadcasts b
    on b.id = r.broadcast_id and b.organization_id = r.organization_id
  where r.organization_id = p_organization_id
    and b.connection_id = p_connection_id
    and r.provider_message_id = p_provider_message_id
    and r.status in ('sent','failed')
  limit 1;
  if target_broadcast is null then return; end if;

  if p_delivery_status = 'failed' then
    update public.whatsapp_broadcast_recipients r
    set status = 'failed',
        error_code = case
          when p_error_code ~ '^[0-9]{3,6}$' then 'META_' || p_error_code
          else 'META_SEND_FAILED'
        end
    where r.organization_id = p_organization_id
      and r.broadcast_id = target_broadcast
      and r.provider_message_id = p_provider_message_id
      and r.status = 'sent';
    if p_error_code = '131042' then
      perform public.whatsapp_broadcast_pause(p_organization_id, target_broadcast, true);
    else
      perform public.whatsapp_broadcast_pause(p_organization_id, target_broadcast, false);
    end if;
  elsif p_delivery_status in ('delivered','read') then
    update public.whatsapp_broadcasts set status = 'sending'
    where organization_id = p_organization_id and id = target_broadcast
      and status = 'verifying';
  end if;
end;
$$;
revoke all on function public.whatsapp_broadcast_receipt(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_receipt(uuid,uuid,text,text,text)
  to service_role;

-- Explicit operator action; never automatically resend to an accepted,
-- delivered, read, or unresolved in-flight message. At most three retries
-- for confirmed failed recipients.
create or replace function public.whatsapp_broadcast_resume(
  p_organization_id uuid, p_broadcast_id uuid
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare previous_status text; retried integer := 0; pending integer := 0;
begin
  select status into previous_status
  from public.whatsapp_broadcasts
  where organization_id = p_organization_id and id = p_broadcast_id
  for update;
  if previous_status is null
    or previous_status not in ('paused_billing','paused_error','completed')
  then raise exception 'Broadcast is not paused or retryable' using errcode='22023';
  end if;

  update public.whatsapp_broadcast_recipients r
  set status = 'queued', error_code = '', provider_message_id = null,
      sent_at = null, retry_count = retry_count + 1
  where r.organization_id = p_organization_id
    and r.broadcast_id = p_broadcast_id
    and r.status = 'failed'
    and r.retry_count < 3;
  get diagnostics retried = row_count;

  select count(*) into pending from public.whatsapp_broadcast_recipients r
  where r.organization_id = p_organization_id
    and r.broadcast_id = p_broadcast_id and r.status = 'queued';

  if pending > 0 then
    update public.whatsapp_broadcasts
    set status = 'verifying', completed_at = null
    where organization_id = p_organization_id and id = p_broadcast_id;
  end if;
  return retried;
end;
$$;
revoke all on function public.whatsapp_broadcast_resume(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.whatsapp_broadcast_resume(uuid,uuid)
  to service_role;

commit;
