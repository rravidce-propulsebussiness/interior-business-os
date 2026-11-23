-- "Mark as Final" was unavailable to staff with quotation.edit (Admin, Sales)
-- on every quote that had not been converted yet. Each quote gets a
-- quote-only sales-prospect project shell (projects.is_sales_prospect), and
-- private.quotation_final_can_select treated that shell as the delivery
-- project, so it required the company owner or a site manager role. The
-- function's own rule says an unconverted quote keeps quote-edit rights.
-- Ignore prospect shells in that last fallback. Contract-linked and
-- converted projects keep the owner / project-manager rule.
-- Patch the CURRENT function body in place (later guards stay intact).
begin;

do $patch$
declare
  definition text;
  old_rule text := 'p.id=v_quote.project_id and p.status=''active''';
  new_rule text := 'p.id=v_quote.project_id and p.status=''active'' and not p.is_sales_prospect';
begin
  select pg_get_functiondef('private.quotation_final_can_select(uuid,uuid)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'Missing Final quotation eligibility function';
  end if;
  if position(new_rule in definition)>0 then
    return;
  end if;
  if position(old_rule in definition)=0 then
    raise exception 'Unexpected Final quotation project fallback';
  end if;
  definition := replace(definition,old_rule,new_rule);
  execute definition;
end
$patch$;

commit;
