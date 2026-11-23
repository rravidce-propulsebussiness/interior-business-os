-- Small companies: the business owner and a company Admin are the same
-- authority in project work. Either one acts in every project role (designer,
-- site engineer, watchman, QC inspector, structural reviewer) and can take the
-- owner steps (agreement, advance waiver, stage edits). Homeowners and the
-- platform super admin are unaffected. Company administration (roles,
-- invitations, test resets) keeps its own is_owner checks.

CREATE OR REPLACE FUNCTION private.user_all_rounder(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.organization_memberships m
      JOIN public.membership_roles mr
        ON mr.organization_id = m.organization_id AND mr.membership_id = m.id
      JOIN public.roles r
        ON r.organization_id = mr.organization_id AND r.id = mr.role_id
     WHERE m.organization_id = p_org
       AND m.user_id = p_user
       AND m.status = 'active'
       AND (r.is_owner OR r.key = 'admin')
  )
$function$;

CREATE OR REPLACE FUNCTION private.site_all_rounder(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.is_member(org) AND private.user_all_rounder(org, (SELECT auth.uid()))
$function$;

-- Every project "owner" check now accepts the company Owner or Admin role.
CREATE OR REPLACE FUNCTION private.site_owner(org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.is_member(org) AND private.user_all_rounder(org, (SELECT auth.uid()))
$function$;

REVOKE ALL ON FUNCTION private.user_all_rounder(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.site_all_rounder(uuid) FROM public, anon, authenticated;

CREATE FUNCTION pg_temp.patch_function(fn regprocedure, old_text text, new_text text)
RETURNS void
LANGUAGE plpgsql
AS $patch$
DECLARE
  definition text := pg_get_functiondef(fn);
BEGIN
  IF position(new_text IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_text IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected definition of %: missing %', fn, old_text;
  END IF;
  EXECUTE replace(definition, old_text, new_text);
END
$patch$;

-- Project access: an all-rounder is never demoted by a project role assignment.
SELECT pg_temp.patch_function(
  'private.site_allowed(uuid,uuid,text[])',
  $o$ private.site_owner(org) or$o$,
  $n$ private.site_all_rounder(org) or$n$);
SELECT pg_temp.patch_function(
  'private.site_is_manager(uuid,uuid)',
  $o$ private.site_owner(org) or$o$,
  $n$ private.site_all_rounder(org) or$n$);
SELECT pg_temp.patch_function(
  'private.construction_can_manage(uuid,uuid)',
  $o$and (private.site_owner(org)$o$,
  $n$and (private.site_all_rounder(org)$n$);

-- On-site QC: no separate inspector needed; may QC checks they recorded
-- (with an inspection note, as before for the owner).
SELECT pg_temp.patch_function(
  'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)',
  $o$ if not private.site_owner(p_org) and not exists ($o$,
  $n$ if not private.site_all_rounder(p_org) and not exists ($n$);
SELECT pg_temp.patch_function(
  'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)',
  $o$  if not private.site_owner(p_org) then raise exception 'Non-owner may not QC their own site check'$o$,
  $n$  if not private.site_all_rounder(p_org) then raise exception 'Only the owner or an admin may QC their own site check'$n$);
SELECT pg_temp.patch_function(
  'public.construction_stage_qc_item_read(uuid,uuid)',
  $o$  'can_review',private.site_owner(p_org) or$o$,
  $n$  'can_review',private.site_all_rounder(p_org) or$n$);
SELECT pg_temp.patch_function(
  'public.construction_stage_qc_item_read(uuid,uuid)',
  $o$  'is_owner',private.site_owner(p_org),$o$,
  $n$  'is_owner',private.site_all_rounder(p_org),$n$);
SELECT pg_temp.patch_function(
  'public.construction_stage_qc_item_read(uuid,uuid)',
  $o$  'has_inspector',private.site_owner(p_org) or$o$,
  $n$  'has_inspector',private.site_all_rounder(p_org) or$n$);

-- Formal quality and structural reviews.
SELECT pg_temp.patch_function(
  'public.construction_quality_command(uuid,uuid,text,jsonb)',
  $o$    if not (kind='quality' and private.site_owner(p_org))$o$,
  $n$    if not private.site_all_rounder(p_org)$n$);
SELECT pg_temp.patch_function(
  'public.construction_quality_command(uuid,uuid,text,jsonb)',
  $o$       and not (kind='quality' and private.site_owner(p_org))$o$,
  $n$       and not private.site_all_rounder(p_org)$n$);
SELECT pg_temp.patch_function(
  'public.construction_quality_command(uuid,uuid,text,jsonb)',
  $o$sr.reviewer_id=q.reviewer_id$o$,
  $n$(sr.reviewer_id=q.reviewer_id and not private.user_all_rounder(p_org, sr.reviewer_id))$n$);
DO $current$
DECLARE
  definition text := pg_get_functiondef('private.construction_stage_current(uuid,uuid,uuid)'::regprocedure);
  old_open text := $o$and sr.reviewer_id<>(select reviewer_id from private.construction_stage_reviews$o$;
  new_open text := $n$and (private.user_all_rounder(p_org, sr.reviewer_id) or sr.reviewer_id<>(select reviewer_id from private.construction_stage_reviews$n$;
  old_close text := $o$where id=c.quality_review_id)$o$;
BEGIN
  IF position(new_open IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_open IN definition) = 0
     OR (length(definition) - length(replace(definition, old_close, ''))) <> length(old_close) THEN
    RAISE EXCEPTION 'Unexpected definition of construction_stage_current';
  END IF;
  definition := replace(definition, old_open, new_open);
  definition := replace(definition, old_close, old_close || ')');
  EXECUTE definition;
END
$current$;

-- Owner stage edits.
SELECT pg_temp.patch_function(
  'public.project_stage_owner_read(uuid,uuid)',
  $o$'can_edit',private.site_owner(p_org) and$o$,
  $n$'can_edit',private.site_all_rounder(p_org) and$n$);
