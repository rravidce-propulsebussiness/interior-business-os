-- Patch the CURRENT canonical functions in place rather than reusing an older
-- function body: later migrations added signed-agreement and Final-quotation
-- permission guards that must remain intact.
-- These changes accept per-floor percentage precision while keeping the
-- existing signed-quote importer and stage-payment idempotency behavior.
begin;

do $patch$
declare
  definition text;
  old_limit text := 'array_length(v_names,1)>40';
  new_limit text := 'array_length(v_names,1)>100';
begin
  select pg_get_functiondef(
    'private.sync_signed_quotation_schedule(uuid,uuid)'::regprocedure
  ) into definition;
  if definition is null then
    raise exception 'Missing signed quote payment importer';
  end if;
  if position(old_limit in definition)>0 then
    definition := replace(definition,old_limit,new_limit);
  elsif position(new_limit in definition)=0 then
    raise exception 'Unexpected signed quote payment count guard';
  end if;
  if position('{1,2}' in definition)>0 then
    definition := replace(definition,'{1,2}','{1,8}');
  elsif position('{1,8}' in definition)=0 then
    raise exception 'Unexpected signed quote percentage parser';
  end if;
  execute definition;
end
$patch$;

do $patch$
declare
  definition text;
  old_limit text := 'array_length(quote_lines,1)>40';
  new_limit text := 'array_length(quote_lines,1)>100';
begin
  select pg_get_functiondef(
    'private.certified_stage_payment_requests(uuid,uuid)'::regprocedure
  ) into definition;
  if definition is null then
    raise exception 'Missing certified stage payment function';
  end if;
  if position(old_limit in definition)>0 then
    definition := replace(definition,old_limit,new_limit);
  elsif position(new_limit in definition)=0 then
    raise exception 'Unexpected certified stage payment count guard';
  end if;
  if position('{1,2}' in definition)>0 then
    definition := replace(definition,'{1,2}','{1,8}');
  elsif position('{1,8}' in definition)=0 then
    raise exception 'Unexpected certified-stage percentage parser';
  end if;
  execute definition;
end
$patch$;

commit;
