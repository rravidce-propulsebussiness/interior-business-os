-- Global template governs starting specification categories, NOT tenant prices.
-- Existing company packages, rates, and issued quotation revisions are untouched.
begin;
create table private.construction_spec_templates(
  template_key text primary key check(template_key='construction'),
  sections jsonb not null check(
    jsonb_typeof(sections)='array'
    and jsonb_array_length(sections)<=18
    and octet_length(sections::text)<=10000
  ),
  updated_at timestamptz not null default now()
);
revoke all on private.construction_spec_templates from public,anon,authenticated;
alter table private.construction_spec_templates enable row level security;

insert into private.construction_spec_templates(template_key,sections) values
('construction',jsonb_build_array(
 jsonb_build_object('title','Architectural plans','kind','plans','deliverables',
   jsonb_build_array('Architectural floor plan','Structural drawing',
   'Electrical layout','Plumbing layout','Staircase detail','Elevation design',
   '3D views','Working drawings')),
 jsonb_build_object('title','Steel / TMT','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Cement','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Sand & aggregates','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Bricks / blocks','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Tiles / flooring','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Kitchen & granite','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Doors & windows','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Bathrooms & plumbing','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Electrical materials','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Painting','kind','material','deliverables','[]'::jsonb),
 jsonb_build_object('title','Elevation & metal works','kind','custom','deliverables','[]'::jsonb),
 jsonb_build_object('title','Exclusions & warranty','kind','custom','deliverables','[]'::jsonb)
));
create function public.construction_spec_template_get()
returns jsonb language sql stable security definer set search_path='' as $get$
 select sections from private.construction_spec_templates
 where template_key='construction'
$get$;
revoke all on function public.construction_spec_template_get()
 from public,anon;
grant execute on function public.construction_spec_template_get()
 to authenticated;

create function public.construction_spec_template_save(p_sections jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $save$
declare
  v_section jsonb;
  v_drawing jsonb;
begin
  perform private.require_platform('platform.organizations.manage');
  if jsonb_typeof(p_sections) <> 'array'
    or jsonb_array_length(p_sections)>18
    or jsonb_array_length(p_sections)=0
    or octet_length(p_sections::text)>10000
  then raise exception 'Invalid template categories' using errcode='22023'; end if;
  for v_section in select value from jsonb_array_elements(p_sections)
  loop
    if jsonb_typeof(v_section)<>'object'
      or (v_section-array['title','kind','deliverables']) <> '{}'::jsonb
      or length(btrim(coalesce(v_section->>'title',''))) not between 2 and 90
      or v_section->>'kind' not in ('plans','material','custom')
      or jsonb_typeof(v_section->'deliverables')<>'array'
      or jsonb_array_length(v_section->'deliverables')>16
    then raise exception 'Invalid template category' using errcode='22023';end if;
    for v_drawing in select value from jsonb_array_elements(v_section->'deliverables')
    loop
      if jsonb_typeof(v_drawing)<>'string'
         or length(btrim(v_drawing #>> '{}')) not between 2 and 90
      then raise exception 'Invalid template drawing' using errcode='22023';end if;
    end loop;
  end loop;
  update private.construction_spec_templates
    set sections=p_sections,updated_at=now()
    where template_key='construction';
  return true;
end $save$;
revoke all on function public.construction_spec_template_save(jsonb) from public,anon;
grant execute on function public.construction_spec_template_save(jsonb) to authenticated;
commit;