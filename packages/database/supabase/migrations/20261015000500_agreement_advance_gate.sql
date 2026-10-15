-- Make a recorded advance (not merely a request) mandatory for new contracts.
-- Existing contracts retain their historical execution eligibility.
begin;
create table if not exists private.project_advance_requirements (
 organization_id uuid not null,
 contract_id uuid primary key references public.contracts(id),
 project_id uuid not null references public.projects(id),
 created_at timestamptz not null default now()
);
revoke all on private.project_advance_requirements from public,anon,authenticated;
alter table private.project_advance_requirements enable row level security;
alter table private.project_advance_requirements force row level security;
create or replace function private.require_advance_for_new_contract()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.project_advance_requirements(organization_id,contract_id,project_id)
 values(new.organization_id,new.id,new.project_id)
 on conflict(contract_id) do nothing;
 return new;
end; $$;
drop trigger if exists new_project_contract_requires_advance on public.contracts;
create trigger new_project_contract_requires_advance after insert on public.contracts
 for each row execute function private.require_advance_for_new_contract();
CREATE OR REPLACE FUNCTION private.project_agreement_authorized(p_org uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((
   select count(*)=1 and bool_and(
     exists(select 1 from public.payment_schedules ps
       where ps.organization_id=c.organization_id and ps.contract_id=c.id
         and ps.status='active')
     and (
       not exists(select 1 from private.project_advance_requirements req
         where req.organization_id=c.organization_id and req.contract_id=c.id)
       or exists(select 1 from public.payments payment
         where payment.organization_id=c.organization_id and payment.contract_id=c.id
           and payment.project_id=c.project_id and payment.status='recorded'
           and private.finance_decimal(payment.amount)>0)
     )
     and exists(select 1
       from private.project_agreement_events e
       where e.organization_id=c.organization_id and e.project_id=c.project_id
         and e.contract_id=c.id
         and e.event_kind in ('signed_copy_recorded','owner_exception')
         and e.scope_fingerprint=private.project_agreement_scope(c.id)
         and e.sequence=(
           select max(recent.sequence) from private.project_agreement_events recent
           where recent.organization_id=c.organization_id
             and recent.project_id=c.project_id and recent.contract_id=c.id
         ))
   )
   from public.contracts c
   where c.organization_id=p_org and c.project_id=p_project
     and c.status='active'
 ),false);
$function$
;
CREATE OR REPLACE FUNCTION public.project_agreement_read(p_organization_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.contracts;latest private.project_agreement_events;active_count integer;
begin
 if not private.construction_can_manage(p_organization_id,p_project_id)
   or not private.finance_access(p_organization_id,'contract.view')
 then raise exception 'Contract workspace unavailable' using errcode='42501';end if;
 select count(*) into active_count from public.contracts
  where organization_id=p_organization_id and project_id=p_project_id and status='active';
 select * into c from public.contracts
  where organization_id=p_organization_id and project_id=p_project_id
  order by (status='active') desc,accepted_at desc,id desc limit 1;
 if c.id is not null then
  select * into latest from private.project_agreement_events
    where organization_id=p_organization_id and project_id=p_project_id
      and contract_id=c.id order by sequence desc limit 1;
 end if;
 return jsonb_build_object(
   'contract_id',c.id,'contract_number',c.contract_number,
   'contract_status',c.status,'contract_value',c.original_contract_value,
   'currency',c.currency,'active_contract_count',active_count,
   'advance_required',c.id is not null and exists(
       select 1 from private.project_advance_requirements req
       where req.organization_id=p_organization_id and req.contract_id=c.id),
   'advance_received',c.id is not null and exists(
       select 1 from public.payments payment
       where payment.organization_id=p_organization_id and payment.contract_id=c.id
         and payment.project_id=p_project_id and payment.status='recorded'
         and private.finance_decimal(payment.amount)>0),
   'advance_total',coalesce((
       select sum(private.finance_decimal(payment.amount))::text
       from public.payments payment
       where payment.organization_id=p_organization_id and payment.contract_id=c.id
         and payment.project_id=p_project_id and payment.status='recorded'
     ),'0'),
   'active_schedule',c.id is not null and exists(
       select 1 from public.payment_schedules ps
       where ps.organization_id=p_organization_id and ps.contract_id=c.id
         and ps.status='active'),
   'clearance_event_id',latest.id,'clearance_type',latest.event_kind,
   'clearance_media_id',latest.media_id,'clearance_recorded_at',latest.created_at,
   'current_scope',coalesce(c.id is not null and latest.scope_fingerprint=
      private.project_agreement_scope(c.id),false),
   'execution_authorized',coalesce(private.project_agreement_authorized(p_organization_id,p_project_id),false),
   'can_authorize_exception',coalesce(private.site_owner(p_organization_id),false)
 );
end$function$
;
commit;