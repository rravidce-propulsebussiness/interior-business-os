-- A construction project needs a photo for every work item, site check and
-- QC item: several hundred over its life. The old cap of 150 photos stopped
-- real projects partway through the structure, even though photos are small.
-- Replace it with a per-project storage budget (750 MB stored in the
-- database) and a generous count ceiling, with a message that says what to do.
DO $patch$
DECLARE
  definition text := pg_get_functiondef(
    'public.project_site_media_put(uuid,uuid,text,text,text,text,text)'::regprocedure);
  old_text text := $o$ if (select count(*) from private.site_media where organization_id=p_organization_id and project_id=p_project_id)>=150 then raise exception 'Project media count limit reached' using errcode='23514';end if;$o$;
  new_text text := $n$ if (select count(*) from private.site_media where organization_id=p_organization_id and project_id=p_project_id)>=1500
    or (select coalesce(sum(octet_length(bytes)),0) from private.site_media where organization_id=p_organization_id and project_id=p_project_id)
       + length(p_base64)*3/4 > 786432000
 then raise exception 'Project photo storage is full. Reuse an existing project photo for this item.' using errcode='23514';end if;$n$;
BEGIN
  IF position(new_text IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_text IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected project_site_media_put definition';
  END IF;
  EXECUTE replace(definition, old_text, new_text);
END
$patch$;
