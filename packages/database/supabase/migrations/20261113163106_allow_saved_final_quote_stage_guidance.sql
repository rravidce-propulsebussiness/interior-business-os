-- Allow quote-specific material and report guidance to sync for a pending
-- owner-prepared project whose frozen construction timeline came from its
-- current saved customer Final quotation. Digital acceptance and the existing
-- project-stage source checks remain unchanged.
do $migration$
declare
 definition text;
 old_gate text := $old$
 select * into rev from public.quotation_revisions where id=c.revision_id and organization_id=p_org
   and status in('issued','superseded');
 if rev.id is null or
   not exists(select 1 from private.construction_project_stages
     where project_id=c.project_id and organization_id=p_org) then
  raise exception 'Approved quotation stage snapshot required' using errcode='42501';end if;
$old$;
 new_gate text := $new$
 select * into rev from public.quotation_revisions where id=c.revision_id and organization_id=p_org;
 if rev.id is null
   or not (
     rev.status in('issued','superseded')
     or (rev.status='draft' and c.status='pending' and c.acceptance_id is null
       and exists(
         select 1 from public.quotations q
          where q.organization_id=p_org and q.id=rev.quotation_id
            and q.customer_id=c.customer_id and q.current_revision_id=rev.id
            and q.status='draft'
            and (public.quotation_final_choices(p_org,array[q.customer_id])->>q.customer_id::text)
              =q.id::text))
   )
   or not exists(select 1 from private.construction_project_stages
     where project_id=c.project_id and organization_id=p_org) then
  raise exception 'Current Final quotation stage snapshot required' using errcode='42501';end if;
$new$;
begin
 select pg_get_functiondef(
   'public.project_quote_stage_guidance_import(uuid,uuid)'::regprocedure)
  into definition;
 if definition is null or position(old_gate in definition)=0 then
  raise exception 'Quotation stage guidance guard changed; inspect before enabling saved Final synchronization';
 end if;
 execute replace(definition,old_gate,new_gate);
end
$migration$;
