\set ON_ERROR_STOP on
begin;
-- Stage guidance import keeps the execution flow, the revision guard and the
-- saved-Final gate while also storing item-level work/QC guides.
do $$
declare imp text := pg_get_functiondef(
  'public.project_quote_stage_guidance_import(uuid,uuid)'::regprocedure);
 rd text := pg_get_functiondef('public.project_stage_guidance_read(uuid,uuid)'::regprocedure);
begin
 if position($t$array['work','materials','checks','reports','flow','guides']$t$ in imp) = 0 then
   raise exception 'FAIL: import does not accept both flow and guides';end if;
 if position('flow,item_guides)' in imp) = 0 then
   raise exception 'FAIL: import does not store flow and guides';end if;
 if position('does not match the frozen project timeline' in imp) = 0 then
   raise exception 'FAIL: revision guard lost';end if;
 if position('quotation_final_choices' in imp) = 0 then
   raise exception 'FAIL: saved Final quotation gate lost';end if;
 if position('length(v_raw)>250000' in imp) = 0 then
   raise exception 'FAIL: import size limit differs from the app';end if;
 if position($t$'flow',g.flow$t$ in rd) = 0 or position($t$'guides',g.item_guides$t$ in rd) = 0 then
   raise exception 'FAIL: read does not return flow and guides';end if;
 if not exists(select 1 from information_schema.columns where table_schema='private'
   and table_name='project_stage_guidance' and column_name='item_guides') then
   raise exception 'FAIL: item_guides column missing';end if;
 raise notice 'PASS: stage guidance keeps flow, guards and guides';
end$$;
rollback;
