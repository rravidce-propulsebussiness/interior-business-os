begin;

-- Apply a company's edited letterhead to an EXISTING DRAFT only.
-- An issued revision retains its immutable original identity and branding.
-- All authorization and tenant boundaries are checked inside PostgreSQL;
-- authenticated clients still cannot UPDATE quotation_revisions directly.
create or replace function public.quotation_refresh_draft_branding(
  p_organization_id uuid,
  p_revision_id uuid,
  p_expected_version integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $refresh$
declare
  draft public.quotation_revisions%rowtype;
  company_branding jsonb;
  updated_version integer;
begin
  if auth.uid() is null or
     not private.commercial_access(p_organization_id, 'quotation.edit', 'quotation')
  then
    raise exception 'Not allowed to edit this company quotation'
      using errcode='42501';
  end if;

  select * into draft
  from public.quotation_revisions
  where id = p_revision_id and organization_id = p_organization_id
  for update;

  if not found or draft.status <> 'draft' then
    raise exception 'Only company-owned draft quotations can refresh branding'
      using errcode='42501';
  end if;
  if p_expected_version <> draft.version then
    raise exception 'Quotation changed. Reload and try again'
      using errcode='40001';
  end if;

  select branding into company_branding
  from public.organization_quotation_settings
  where organization_id = p_organization_id;

  if company_branding is null
     or jsonb_typeof(company_branding) <> 'object'
     or coalesce(company_branding->>'name', '') = ''
  then
    raise exception 'Set up company quotation branding first'
      using errcode='22023';
  end if;

  update public.quotation_revisions
  set document_snapshot = jsonb_set(
        draft.document_snapshot,
        '{branding}',
        company_branding,
        true
      ),
      version = draft.version + 1
  where id = draft.id
    and organization_id = p_organization_id
    and status = 'draft'
    and version = p_expected_version
  returning version into updated_version;

  if updated_version is null then
    raise exception 'Quotation changed. Reload and try again'
      using errcode='40001';
  end if;

  return updated_version;
end;
$refresh$;

revoke all on function public.quotation_refresh_draft_branding(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.quotation_refresh_draft_branding(uuid,uuid,integer)
  to authenticated;

commit;
