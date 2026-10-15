-- Allow built-in lead intake fields from the construction and interior quick-add forms.
-- These standard fields are not customizable CRM requirement questions.
-- Custom CRM fields remain strictly validated against the tenant's configuration.
begin;
create or replace function private.crm_requirements(
  org uuid, industry uuid, answers jsonb
) returns void language plpgsql stable security definer set search_path=''
as $crm_requirements$
declare
  f public.crm_requirement_fields;
  k text;
  v jsonb;
  value_text text;
begin
  if jsonb_typeof(answers) is distinct from 'object'
     or octet_length(answers::text)>16000 then
    raise exception 'Invalid requirements' using errcode='22023';
  end if;
  for k,v in select * from jsonb_each(answers) loop
    select * into f from public.crm_requirement_fields
      where organization_id=org and key=k and active
        and (industry_id is null or industry_id=industry);
    if f.id is null then
      -- Recognize only the typed, first-party construction/interior intake fields.
      if k not in (
        'service','project_type','plot_area_sq_yards','floors',
        'built_up_area_sq_ft','budget','timeline','property_type',
        'bhk','interior_scope','selected_work','design_style'
      ) or jsonb_typeof(v)<>'string' then
        raise exception 'Invalid requirement answer' using errcode='22023';
      end if;
      value_text=v#>>'{}';
      if length(value_text)>2000
        or (k='service' and value_text not in ('construction','interior'))
        or (k='project_type' and value_text not in ('residential','commercial','renovation','extension'))
        or (k='floors' and value_text not in ('ground','g1','g2','g3plus'))
        or (k='property_type' and value_text not in ('apartment','villa','independent_house','office','commercial_space'))
        or (k='interior_scope' and value_text not in ('end_to_end','selected_work'))
        or (k in ('plot_area_sq_yards','built_up_area_sq_ft')
            and (value_text !~ '^[0-9]+(\\.[0-9]{1,2})?$'
                 or length(value_text)>15))
      then
        raise exception 'Invalid requirement answer' using errcode='22023';
      end if;
    elsif (f.field_type='text' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000))
       or (f.field_type='number' and jsonb_typeof(v)<>'number')
       or (f.field_type='boolean' and jsonb_typeof(v)<>'boolean')
       or (f.field_type='select' and not f.options @> jsonb_build_array(v))
    then
      raise exception 'Invalid requirement answer' using errcode='22023';
    end if;
  end loop;
  if exists(
    select 1 from public.crm_requirement_fields
    where organization_id=org and active and required
      and (industry_id is null or industry_id=industry)
      and (not answers ? key or answers->key='null'::jsonb or answers->>key='')
  ) then
    raise exception 'Required answer missing' using errcode='22023';
  end if;
end;
$crm_requirements$;
revoke all on function private.crm_requirements(uuid,uuid,jsonb)
  from public,anon,authenticated;
commit;
