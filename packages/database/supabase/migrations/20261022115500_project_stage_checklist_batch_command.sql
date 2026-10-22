-- Batch site inspection checks through the same permission-checked canonical command.
-- Invoker rights + the existing command's per-project authorization preserve tenant isolation.
-- All checks and the optional field-work submission run in one transaction.
create or replace function public.project_stage_checklist_batch_command(
 p_org uuid,p_project uuid,p_stage uuid,p_items jsonb,p_finish boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
 v_item jsonb;
 v_total integer;
 v_photo uuid;
 v_count integer := 0;
 v_status text := 'in_progress';
begin
 if auth.uid() is null then
   raise exception 'Sign in to update project checks' using errcode='42501';
 end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' then
   raise exception 'Choose project checks to update' using errcode='22023';
 end if;
 v_total := jsonb_array_length(p_items);
 if v_total < 1 or v_total > 30 then
   raise exception 'Select 1 to 30 checks at once' using errcode='22023';
 end if;
 if exists (select 1 from jsonb_array_elements(p_items) x
   where jsonb_typeof(x) <> 'object'
     or x->>'index' is null
     or x->>'title' is null
     or x->>'photo_id' is null) then
   raise exception 'Every check must include its name and evidence' using errcode='22023';
 end if;
 if (select count(distinct (x->>'index')) from jsonb_array_elements(p_items) x) <> v_total then
   raise exception 'Repeated checklist items are not allowed' using errcode='22023';
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_photo := (v_item->>'photo_id')::uuid;
   perform public.project_stage_checklist_command(
     p_org,p_project,p_stage,'check',(v_item->>'index')::integer,
     v_item->>'title','done',left(coalesce(v_item->>'note',''),2000),v_photo);
   v_count := v_count + 1;
 end loop;
 if p_finish then
   perform public.construction_stage_execution_command(
      p_org,p_project,p_stage,'submit_for_qc','');
   v_status := 'ready_for_qc';
 end if;
 return jsonb_build_object('saved',true,'count',v_count,'stage_status',v_status);
end
$function$;
revoke all on function public.project_stage_checklist_batch_command(uuid,uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.project_stage_checklist_batch_command(uuid,uuid,uuid,jsonb,boolean) to authenticated;
