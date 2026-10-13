\set ON_ERROR_STOP on
begin;
do $verify$
begin
  if has_function_privilege('anon','public.quotation_share_pdf_attachments(text)','EXECUTE')
  or has_function_privilege('authenticated','public.quotation_share_pdf_attachments(text)','EXECUTE')
  then raise exception 'Share PDF paths exposed to browser roles'; end if;
  if not has_function_privilege('service_role','public.quotation_share_pdf_attachments(text)','EXECUTE')
  then raise exception 'Service cannot access PDF attachment index'; end if;
  if has_table_privilege('authenticated','public.construction_package_spec_attachments','SELECT')
    or has_table_privilege('anon','public.construction_package_spec_attachments','SELECT')
  then raise exception 'Package file metadata exposed'; end if;
  if (select provolatile from pg_proc where oid='public.construction_package_list(uuid)'::regprocedure) <> 'v'
  then raise exception 'Package list RPC must be volatile'; end if;
  raise notice 'PASS: private construction package PDF scope';
end $verify$;
rollback;
