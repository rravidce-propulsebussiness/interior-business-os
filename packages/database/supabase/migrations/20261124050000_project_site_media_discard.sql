-- A photo uploaded as evidence for a step that is then refused (for example an
-- on-site QC decision the database rejects) must not stay in project media and
-- use up the storage budget. The uploader may discard their own fresh photo
-- while nothing references it; referenced or older media is never removed.
CREATE OR REPLACE FUNCTION public.project_site_media_discard(
  p_org uuid,
  p_project uuid,
  p_media uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NOT private.site_access(p_org, p_project) THEN
    RAISE EXCEPTION 'Project unavailable' USING errcode = '42501';
  END IF;
  BEGIN
    DELETE FROM private.site_media
     WHERE organization_id = p_org AND project_id = p_project AND id = p_media
       AND uploaded_by = (SELECT auth.uid())
       AND created_at > now() - interval '15 minutes'
    RETURNING coalesce(r2_key, '') INTO v_key;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('discarded', false, 'r2_key', '');
  END;
  RETURN jsonb_build_object('discarded', v_key IS NOT NULL, 'r2_key', coalesce(v_key, ''));
END
$function$;

REVOKE ALL ON FUNCTION public.project_site_media_discard(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_site_media_discard(uuid, uuid, uuid) TO authenticated;
