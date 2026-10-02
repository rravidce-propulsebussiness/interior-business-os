begin;
create function public.quotation_response_queue(p_organization_id uuid,p_status text default '',p_project_id uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$declare total bigint;rows jsonb;begin
 if not private.commercial_access(p_organization_id,'quotation.customer_response.view','quotation') or not private.has_permission(p_organization_id,'quotation.view') then raise exception 'Forbidden' using errcode='42501';end if;
 if p_page not between 1 and 10000 or p_status not in ('','awaiting','approved','changes_requested','declined') then raise exception 'Invalid filter' using errcode='22023';end if;
 select count(*) into total from public.quotation_revisions r left join public.quotation_customer_responses c on c.revision_id=r.id where r.organization_id=p_organization_id and r.status='issued' and (p_project_id is null or r.project_id=p_project_id) and (p_status='' or coalesce(c.action,'awaiting')=p_status);
 select coalesce(jsonb_agg(x),'[]') into rows from (select r.id,q.quotation_number,r.revision_number,r.project_id,r.document_snapshot#>>'{project,name}' project_name,coalesce(c.action,'awaiting') response_status,c.customer_name,c.comment,c.responded_at,c.accepted_amount,c.currency from public.quotation_revisions r join public.quotations q on q.id=r.quotation_id left join public.quotation_customer_responses c on c.revision_id=r.id where r.organization_id=p_organization_id and r.status='issued' and (p_project_id is null or r.project_id=p_project_id) and (p_status='' or coalesce(c.action,'awaiting')=p_status) order by r.issued_at desc,r.id limit 25 offset (p_page-1)*25)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end$$;
revoke all on function public.quotation_response_queue(uuid,text,uuid,integer) from public,anon;
grant execute on function public.quotation_response_queue(uuid,text,uuid,integer) to authenticated;
alter table public.leads add constraint nonnegative_maximum_budget check(budget_max>=0);
alter table public.leads add constraint phone_character_set check(phone ~ '^(\+|00)?[0-9() .-]+$');
commit;
