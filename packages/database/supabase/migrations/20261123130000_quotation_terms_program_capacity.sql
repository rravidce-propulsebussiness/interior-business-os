-- Quotation revision terms also carry the saved payment plan, stage links and
-- construction programme (the programme alone may be up to 100,000 chars).
-- public.commit_quotation still rejected terms over 10,000 characters, so no
-- construction payment schedule with a programme could be saved. The
-- application schema already allows 300,000; align the database guard.
-- Patch the CURRENT function body in place so later permission and signing
-- guards remain intact. customer_notes / internal_notes keep 10,000.
begin;

do $patch$
declare
  definition text;
  old_guard text := 'length(e->>''terms'')>10000';
  new_guard text := 'length(e->>''terms'')>300000';
begin
  select pg_get_functiondef('public.commit_quotation(text,text)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'Missing quotation command function';
  end if;
  if position(old_guard in definition)>0 then
    definition := replace(definition,old_guard,new_guard);
  elsif position(new_guard in definition)=0 then
    raise exception 'Unexpected quotation terms length guard';
  end if;
  execute definition;
end
$patch$;

commit;
