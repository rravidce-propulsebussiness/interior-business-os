\set ON_ERROR_STOP on
begin;
select set_config(
  'request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true
);
set local role authenticated;

-- Existing fixture organization belongs to the authenticated test owner.
select public.construction_package_save(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  jsonb_build_object(
    'name', 'Drawing fields regression package',
    'code', 'DRAWINGS-TEST', 'description', 'Roll back at end',
    'ratePerSqft', '1950', 'status', 'inactive',
    'themeColor', '#089E9C', 'specSections', jsonb_build_array(
      jsonb_build_object(
        'title', 'Planning & Drawings', 'kind', 'plans',
        'brand', '', 'grade', '', 'allowancePerSqft', '',
        'description', 'One revision included',
        'deliverables', jsonb_build_array('Electrical layout','Plumbing layout'),
        'customFields', jsonb_build_array(
          jsonb_build_object('label','File format','value','PDF + DWG')
        )
      )
    )
  )
) as regression_package_id \gset

do $assert$
declare d jsonb;
begin
  select spec_sections into d
    from private.construction_quote_package_designs
   where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     and package_id=:'regression_package_id'::uuid;
  if d->0->'deliverables'->>0 <> 'Electrical layout'
     or d->0->'customFields'->0->>'value' <> 'PDF + DWG'
  then raise exception 'Saved drawing fields were not preserved'; end if;
  raise notice 'PASS: company plan fields and custom rows saved';
end $assert$;

do $assert$
begin
  begin
    perform public.construction_package_save(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      jsonb_build_object(
        'name', 'Bad branded plan', 'code','BAD-DRAWING-TEST',
        'ratePerSqft','1950','status','inactive',
        'specSections',jsonb_build_array(
          jsonb_build_object(
            'title','Planning & Drawings','kind','plans',
            'brand','Tata','grade','', 'description','',
            'allowancePerSqft',''
          )
        )
      )
    );
    raise exception 'Branded architectural plans were accepted';
  exception when sqlstate '22023' then
    raise notice 'PASS: drawing sections cannot contain a material brand';
  end;
end $assert$;
rollback;