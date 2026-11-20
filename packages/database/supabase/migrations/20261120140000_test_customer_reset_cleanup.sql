-- Owner-only test data reset (Settings → reset test data) could not run for
-- a company with real usage: several guards had no reset exception.
--
-- Owner-only test data reset: allow clearing immutable history (agreement
-- events, stage reviews, inspections ...) for projects of customers marked
-- as test data ("TEST ONLY — ..."), not only the built-in demo fixture.
-- Real customers' history stays immutable; the reset remains owner-only and
-- scoped to one company by private.owner_test_reset_allowed and the
-- business_os.test_reset_org setting checked by the immutability triggers.
BEGIN;
CREATE OR REPLACE FUNCTION private.test_fixture_cleanup_allowed(p_org uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT private.owner_test_reset_allowed(p_org)
 AND EXISTS(
   SELECT 1 FROM public.projects p
   JOIN public.customers c ON c.organization_id=p.organization_id AND c.id=p.customer_id
   WHERE p.organization_id=p_org AND p.id=p_project
     AND (
       (p.name='TEST ONLY — Project Management Workflow Demo'
        AND p.notes='TEST ONLY — synthetic internal workflow record. No real customer; do not contact.'
        AND c.display_name='TEST ONLY — ProPulse Workflow QA')
       OR c.display_name LIKE 'TEST ONLY — %'
     )
 );
$function$;

-- CRM history (lead activities, customer quotation responses) is append-only.
-- The owner-confirmed reset deletes the leads and quotations themselves, so
-- it must be able to delete their history too; without this the reset fails
-- for every company that has used the CRM. Updates stay blocked, and deletes
-- are allowed only inside the reset transaction for that company.
CREATE OR REPLACE FUNCTION private.crm_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF tg_op='DELETE'
     AND coalesce(current_setting('business_os.test_reset_org',true),'')=old.organization_id::text
     AND private.owner_test_reset_allowed(old.organization_id) THEN
    RETURN old;
  END IF;
  RAISE EXCEPTION 'Append-only record' USING ERRCODE='23514';
END;
$function$;
-- Lines of issued / cancelled quotation revisions are frozen. The owner reset
-- deletes the quotations themselves, so their lines may be deleted inside
-- that reset only; every other change to frozen lines stays blocked.
CREATE OR REPLACE FUNCTION private.guard_quotation_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_revision uuid;new_revision uuid;
begin
 if tg_op='DELETE'
    and coalesce(current_setting('business_os.test_reset_org',true),'')=coalesce(to_jsonb(old)->>'organization_id','')
    and private.owner_test_reset_allowed((to_jsonb(old)->>'organization_id')::uuid) then
  return old;
 end if;
 if tg_table_name='quotation_items' then
  if tg_op<>'INSERT' then old_revision=old.revision_id;end if;
  if tg_op<>'DELETE' then new_revision=new.revision_id;end if;
 else
  if tg_op<>'INSERT' then select revision_id into old_revision from public.quotation_items where id=old.item_id;end if;
  if tg_op<>'DELETE' then select revision_id into new_revision from public.quotation_items where id=new.item_id;end if;
 end if;
 -- Locks serialize line writes with issuance, independent of the caller.
 perform 1 from public.quotation_revisions where id in(old_revision,new_revision) order by id for update;
 if exists(select 1 from public.quotation_revisions where id in(old_revision,new_revision) and status<>'draft') then raise exception 'Frozen revision lines' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and (old.organization_id<>new.organization_id or old.id<>new.id or old_revision is distinct from new_revision) then raise exception 'Stable line identity required' using errcode='23514';end if;
 return new;
end $function$;
-- Quotation revisions cannot be deleted, except by the owner reset, which
-- deletes their quotations too. All update rules are unchanged.
CREATE OR REPLACE FUNCTION private.guard_quotation_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE' then
  if coalesce(current_setting('business_os.test_reset_org',true),'')=old.organization_id::text
     and private.owner_test_reset_allowed(old.organization_id) then
   return old;
  end if;
  raise exception 'Revision deletion forbidden' using errcode='23514';
 end if;
 if old.status<>'draft' then
  if (to_jsonb(new)-array['status','superseded_at','cancelled_at','updated_at','version']) is distinct from (to_jsonb(old)-array['status','superseded_at','cancelled_at','updated_at','version']) then raise exception 'Frozen revision' using errcode='23514';end if;
  if new.status is distinct from old.status and not(old.status='issued' and new.status in ('superseded','cancelled')) then raise exception 'Invalid transition' using errcode='23514';end if;
 elsif new.status not in ('draft','issued','cancelled') then raise exception 'Invalid transition' using errcode='23514';end if;
 if new.organization_id<>old.organization_id or new.quotation_id<>old.quotation_id or new.project_id<>old.project_id or new.revision_number<>old.revision_number then raise exception 'Stable identity required' using errcode='23514';end if;
 return new;
end $function$;

-- Execution history follows the same rule as other immutable project history
-- (private.ops_immutable): only the owner reset may delete it, and only for
-- projects of TEST ONLY customers (private.test_fixture_cleanup_allowed).
CREATE OR REPLACE FUNCTION private.execution_document_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_org uuid; v_project uuid;
begin
 if tg_op='DELETE' then
  v_org:=nullif(to_jsonb(old)->>'organization_id','')::uuid;
  v_project:=nullif(to_jsonb(old)->>'project_id','')::uuid;
  if v_project is null and to_jsonb(old) ? 'revision_id' then
   select c.project_id into v_project
    from public.execution_estimate_revisions r
    join public.contracts c on c.organization_id=r.organization_id and c.id=r.contract_id
    where r.organization_id=v_org and r.id=nullif(to_jsonb(old)->>'revision_id','')::uuid;
  end if;
  if coalesce(current_setting('business_os.test_reset_org',true),'')=coalesce(v_org::text,'')
     and v_project is not null
     and private.test_fixture_cleanup_allowed(v_org,v_project) then
   return old;
  end if;
 end if;
 raise exception 'Execution document history is immutable' using errcode='23514';
end$function$;

CREATE OR REPLACE FUNCTION private.ops_history_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a jsonb=to_jsonb(old);b jsonb=to_jsonb(new);v_org uuid;v_project uuid;begin
 if tg_op='DELETE' then
  v_org:=nullif(a->>'organization_id','')::uuid;
  v_project:=nullif(a->>'project_id','')::uuid;
  if v_project is null and a ? 'work_order_id' then
   select w.project_id into v_project from public.subcontractor_work_orders w
    where w.organization_id=v_org and w.id=nullif(a->>'work_order_id','')::uuid;
  end if;
  if coalesce(current_setting('business_os.test_reset_org',true),'')=coalesce(v_org::text,'')
     and v_project is not null
     and private.test_fixture_cleanup_allowed(v_org,v_project) then
   return old;
  end if;
  raise exception 'Execution history cannot be deleted' using errcode='23514';
 end if;
 if a->'id' is distinct from b->'id' or a->'organization_id' is distinct from b->'organization_id' or a->'project_id' is distinct from b->'project_id' then raise exception 'Execution identity is immutable' using errcode='23514';end if;
 if tg_table_name='execution_plan_revisions' and a->>'status' in ('approved','superseded') then
  if not(a->>'status'='approved' and b->>'status'='superseded' and a-array['status','updated_at'] = b-array['status','updated_at']) then raise exception 'Approved plan revision is immutable' using errcode='23514';end if;
 elsif tg_table_name='project_inspections' and a->>'status' in ('passed','failed','requires_rework') or tg_table_name='handover_records' and a->>'status'='approved' or tg_table_name='work_measurements' and a->>'status' in ('certified','rejected') then
  raise exception 'Finalized execution record is immutable' using errcode='23514';
 elsif tg_table_name='subcontractor_work_orders' and a->>'status'<>'draft' and a-array['status','completed_percentage','accepted_percentage','actual_start','actual_end','version','updated_at'] is distinct from b-array['status','completed_percentage','accepted_percentage','actual_start','actual_end','version','updated_at'] then
  raise exception 'Issued work order scope is immutable' using errcode='23514';
 elsif tg_table_name='subcontractor_work_order_costs' and exists(select 1 from public.subcontractor_work_orders where id=(a->>'work_order_id')::uuid and status<>'draft') then
  raise exception 'Issued work order cost is immutable' using errcode='23514';
 end if;return new;
end$function$;
COMMIT;
