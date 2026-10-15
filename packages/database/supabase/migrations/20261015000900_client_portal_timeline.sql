-- Read-only client timeline built from the project's canonical quote-derived
-- construction/interior stage plan. The client never gains staff stage permissions.
begin;

create or replace function public.client_portal_timeline(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare timeline jsonb;
begin
  -- Check the exact project, active invitation and verified auth email on
  -- EVERY request; do not authorize by customer_id alone or trust a URL.
  if not private.client_portal_accessible(p_project_id) then
    raise exception 'Project timeline not shared with your account' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'title', coalesce(nullif(btrim(x.owner_title), ''), x.title),
    'description', left(coalesce(nullif(btrim(x.owner_explanation), ''), x.explanation, ''), 700),
    'phase', x.phase,
    'floor_code', x.floor_code,
    'status', x.status,
    'completed_at', case when x.status in ('completed','certified','done')
                         then x.certified_at else null end,
    'activities', case
      when jsonb_typeof(x.owner_activities)='array' then x.owner_activities
      when jsonb_typeof(x.activities)='array' then x.activities
      else '[]'::jsonb end
  ) order by x.display_order,x.sequence,x.id),'[]'::jsonb)
  into timeline
  from (
    select s.id,s.title,s.explanation,s.phase,s.floor_code,
           s.status,s.activities,s.sequence,
           o.title as owner_title,o.explanation as owner_explanation,
           o.activities as owner_activities,
           coalesce(o.display_order,s.sequence) as display_order,
           (select c.certified_at
            from private.construction_stage_clearances c
            where c.organization_id=s.organization_id
              and c.project_id=s.project_id and c.stage_id=s.id
            order by c.sequence desc limit 1) as certified_at
    from public.projects p
    join private.construction_project_stages s
      on s.organization_id=p.organization_id and s.project_id=p.id
    left join private.project_stage_owner_overrides o
      on o.organization_id=s.organization_id
      and o.project_id=s.project_id and o.stage_id=s.id
    where p.id=p_project_id
    order by coalesce(o.display_order,s.sequence),s.sequence,s.id
    limit 900
  ) x;
  return timeline;
end;
$$;

revoke all on function public.client_portal_timeline(uuid) from public, anon;
grant execute on function public.client_portal_timeline(uuid) to authenticated;

commit;
