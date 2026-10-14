\set ON_ERROR_STOP on
begin;
do $test$
declare
 samples jsonb;
 invalid jsonb;
begin
  select sections into samples from private.construction_spec_field_templates
  where singleton;
  if not private.valid_construction_spec_sections(samples) then
    raise exception 'Seeded global specification defaults invalid';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(samples) x
    where x->>'title'='Architectural plans'
    and x->>'kind'='plans'
    and jsonb_array_length(x->'deliverables')=0
  ) then raise exception 'Architectural drawings missing from template';end if;
  invalid := jsonb_build_array(jsonb_build_object(
    'title','Architectural plans','kind','plans',
    'brand','Example TMT','grade','','allowancePerSqft','',
    'description','','deliverables',jsonb_build_array('Floor plan'),
    'extraFields','[]'::jsonb
  ));
  if private.valid_construction_spec_sections(invalid) then
    raise exception 'A plan category may not use brand/material inputs';
  end if;
  if not private.valid_construction_spec_sections(
    jsonb_build_array(jsonb_build_object(
      'title','Architectural plans','kind','plans',
      'brand','','grade','','allowancePerSqft','',
      'description','Drawings delivered after structural review',
      'deliverables',jsonb_build_array('Floor plan','3D elevation'),
      'extraFields',jsonb_build_array(jsonb_build_object(
        'label','Revisions','value','2 included'
      ))
    ))
  ) then raise exception 'Custom drawing fields should be accepted'; end if;
  if has_function_privilege('anon','public.construction_spec_template_get(uuid)','EXECUTE')
    or has_function_privilege('anon','public.platform_construction_spec_template_save(jsonb)','EXECUTE')
  then raise exception 'Template functions must be authenticated'; end if;
  raise notice 'PASS: global templates, architectural plan fields and access guards';
end $test$;
rollback;
