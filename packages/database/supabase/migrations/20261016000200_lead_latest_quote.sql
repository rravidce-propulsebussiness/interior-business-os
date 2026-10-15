-- Keep every company quotation linked to its lead, but the CRM desk
-- must always preview the most recently CREATED alternative. Sharing an older
-- Standard quotation does not push it above a newer Premium quotation.
begin;
create or replace function public.lead_quotation_summary(
  p_organization_id uuid, p_lead_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
  if not coalesce(private.has_permission(p_organization_id,'lead.view'), false)
     or not coalesce(private.has_permission(p_organization_id,'quotation.view'), false) then
    raise exception 'Not authorized to view lead quotations' using errcode='42501';
  end if;
  if coalesce(array_length(p_lead_ids,1),0)>100 then
    raise exception 'Too many leads' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id',l.lead_id,
    'quotation_id',q.id,
    'revision_id',r.id,
    'status',r.status,
    'quotation_number',q.quotation_number,
    'amount',coalesce(r.totals->>'final_amount','0'),
    'shared',exists(
      select 1 from public.quotation_share_links sh
      where sh.organization_id=l.organization_id and sh.revision_id=r.id
        and sh.revoked_at is null
        and (sh.expires_at is null or sh.expires_at>now())
    )
  ) order by l.created_at desc,q.created_at desc,q.id desc),'[]'::jsonb)
    into result
  from private.lead_quotation_links l
  join public.leads lead
    on lead.id=l.lead_id and lead.organization_id=p_organization_id
  join public.quotations q
    on q.id=l.quotation_id and q.organization_id=l.organization_id
  join public.quotation_revisions r
    on r.id=q.current_revision_id and r.organization_id=q.organization_id
  where l.organization_id=p_organization_id
    and l.lead_id=any(p_lead_ids)
    and q.status<>'cancelled' and r.status<>'cancelled';
  return result;
end $fn$;
revoke all on function public.lead_quotation_summary(uuid,uuid[]) from public,anon;
grant execute on function public.lead_quotation_summary(uuid,uuid[]) to authenticated;
commit;
