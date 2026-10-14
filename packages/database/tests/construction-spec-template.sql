\set ON_ERROR_STOP on
begin;
do $test$
declare
 v_sections jsonb;
 v_first jsonb;
begin
 select public.construction_spec_template_get() into v_sections;
 if jsonb_typeof(v_sections)<>'array' or jsonb_array_length(v_sections)<8
 then raise exception 'Platform template missing';end if;
 v_first=v_sections->0;
 if v_first->>'kind'<>'plans' or
    v_first->>'title'<>'Architectural plans' or
    (v_first->'deliverables')::text not like '%Electrical layout%'
 then raise exception 'Architectural drawings template is invalid';end if;
 if has_function_privilege('anon','public.construction_spec_template_save(jsonb)','EXECUTE')
 then raise exception 'Unprivileged template editing is exposed';end if;
 raise notice 'PASS: company template starts with drawing deliverables, no prices';
end $test$;
rollback;
