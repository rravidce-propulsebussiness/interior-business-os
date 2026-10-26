-- Restore three original construction tiers as independent, editable company templates.
-- New templates are copied to a company once, never read from another tenant.
-- Do NOT re-seed automatically when an owner intentionally removes all packages.
begin;

create or replace function private.seed_three_company_construction_templates(
  p_org uuid, p_actor uuid, p_only_if_empty boolean default false
) returns integer language plpgsql volatile security definer set search_path='' as $fn$
declare v_row jsonb; v_id uuid; v_count integer := 0;
begin
  if p_org is null or p_actor is null or
     not exists(select 1 from public.profiles where id=p_actor) then
    raise exception 'Invalid company or package owner' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_org::text));
  if p_only_if_empty and exists(
    select 1 from private.construction_quote_packages where organization_id=p_org
  ) then return 0; end if;
  for v_row in select value from pg_catalog.jsonb_array_elements($seed$
[{"name":"Standard","code":"STANDARD","description":"Standard construction starter template. Edit its specifications, price and terms for your company. Rates are indicative until confirmed in a project quotation.","ratePerSqft":1650,"themeColor":"#F97316","specSections":[{"title":"Architectural plans","brand":"","grade":"","description":"2D floor plans, structural plans, 3D elevation plans and soil test","allowancePerSqft":""},{"title":"Steel / TMT","brand":"SHREE or equivalent Fe 550 TMT","grade":"Structural engineer design","description":"Steel grade and tonnage per approved drawings.","allowancePerSqft":""},{"title":"Cement","brand":"Nagarjuna OPC 53 for RCC; Priya or equivalent 43 grade for masonry and plaster","grade":"53 / 43 grade as listed","description":"RCC, masonry and plastering specifications.","allowancePerSqft":""},{"title":"Sand","brand":"Robo sand for construction; river sand for plastering","grade":"","description":"Construction and plastering sand.","allowancePerSqft":""},{"title":"Bricks","brand":"Karimnagar bricks","grade":"","description":"","allowancePerSqft":""},{"title":"Coarse aggregates","brand":"Government-approved quarry","grade":"20 mm & 40 mm","description":"","allowancePerSqft":""},{"title":"Kitchen","brand":"Ceramic tile, steel sink and granite","grade":"","description":"2 ft ceramic wall tiles up to ₹45/sft; stainless single sink up to ₹2,000; granite platform up to ₹120/sft","allowancePerSqft":""},{"title":"Main door & locks","brand":"Indian teak","grade":"","description":"Indian teak double main door and teak frame with hardware up to ₹25,000; regular-brand locks","allowancePerSqft":""},{"title":"Internal / bathroom doors","brand":"Flush laminate / WPC","grade":"","description":"Laminate flush internal doors up to ₹7,000; WPC bathroom doors up to ₹6,000","allowancePerSqft":""},{"title":"Windows","brand":"UPVC","grade":"","description":"UPVC three-track sliding windows (2 glass + mosquito mesh), fittings up to ₹350/sft","allowancePerSqft":""},{"title":"Bathrooms & plumbing","brand":"","grade":"","description":"CERA bathroom fittings up to ₹25,000 per bathroom; Prince CPVC/PVC; bathroom waterproofing; wall tiles up to ₹45/sft","allowancePerSqft":""},{"title":"Flooring","brand":"","grade":"","description":"Room tiles up to ₹45/sft; staircase granite up to ₹70/sft; anti-skid parking tiles up to ₹45/sft","allowancePerSqft":""},{"title":"Painting","brand":"Asian / Birla as applicable","grade":"","description":"Asian wall putty 2 coats, primer 1 coat, Asian Tractor emulsion 2 coats; exterior ACE emulsion 2 coats","allowancePerSqft":""},{"title":"Electrical","brand":"","grade":"","description":"Finolex or equivalent fireproof wiring, MARU Basic switches, Sudhakar conduits","allowancePerSqft":""},{"title":"Railing & gate","brand":"","grade":"","description":"SS 202 railing; MS gate allowance up to ₹20,000","allowancePerSqft":""},{"title":"Tanks, sump & plinth","brand":"","grade":"","description":"2,000 L double-layer overhead tank, red-brick underground sump; 2 ft plinth above road; floor-to-floor height 10 ft","allowancePerSqft":""},{"title":"Warranty & supervision","brand":"","grade":"","description":"Brochure references 10-year structural warranty, 1-year seepage warranty, stage-wise engineering checks and CCTV. Company must confirm and customize enforceable warranty and site-service terms.","allowancePerSqft":""}]},{"name":"Premium","code":"PREMIUM","description":"Premium construction starter template. Edit its specifications, price and terms for your company. Rates are indicative until confirmed in a project quotation.","ratePerSqft":1750,"themeColor":"#2563EB","specSections":[{"title":"Architectural plans","brand":"","grade":"","description":"2D floor plans, structural plans, 3D elevation plans, digital survey and soil test","allowancePerSqft":""},{"title":"Steel / TMT","brand":"JAIRAJ or equivalent Fe 550 TMT","grade":"Structural engineer design","description":"Steel grade and tonnage per approved drawings.","allowancePerSqft":""},{"title":"Cement","brand":"Ultratech OPC 53 for RCC; Birla Shakti or equivalent 43 grade for masonry and plaster","grade":"53 / 43 grade as listed","description":"RCC, masonry and plastering specifications.","allowancePerSqft":""},{"title":"Sand","brand":"River sand throughout except terrace flooring and tile works","grade":"","description":"Construction and plastering sand.","allowancePerSqft":""},{"title":"Bricks","brand":"Karimnagar bricks","grade":"","description":"","allowancePerSqft":""},{"title":"Coarse aggregates","brand":"Government-approved quarry","grade":"20 mm & 40 mm","description":"","allowancePerSqft":""},{"title":"Kitchen","brand":"Ceramic tile, steel sink and granite","grade":"","description":"2 ft ceramic wall tiles up to ₹50/sft; stainless sink up to ₹3,000; granite platform up to ₹150/sft","allowancePerSqft":""},{"title":"Main door & locks","brand":"Indian teak","grade":"","description":"Indian teak double main door up to ₹30,000 including frame and fittings; Europa locks","allowancePerSqft":""},{"title":"Internal / bathroom doors","brand":"Flush laminate / WPC","grade":"","description":"Laminate flush internal doors up to ₹8,000; WPC bathroom doors up to ₹7,000","allowancePerSqft":""},{"title":"Windows","brand":"UPVC","grade":"","description":"UPVC windows with glass and mesh shutters up to ₹400/sft including fittings","allowancePerSqft":""},{"title":"Bathrooms & plumbing","brand":"","grade":"","description":"Hindware fittings up to ₹30,000 per bathroom; Astral CPVC/PVC; bathroom waterproofing; wall tiles up to ₹45/sft","allowancePerSqft":""},{"title":"Flooring","brand":"","grade":"","description":"Room tiles up to ₹60/sft; staircase granite up to ₹90/sft; anti-skid parking tiles up to ₹50/sft","allowancePerSqft":""},{"title":"Painting","brand":"Asian / Birla as applicable","grade":"","description":"Birla wall putty 2 coats, primer 1 coat, Asian Premium Emulsion 2 coats; exterior ACE emulsion 2 coats","allowancePerSqft":""},{"title":"Electrical","brand":"","grade":"","description":"Havells or equivalent fireproof wiring, Anchor Penta switches, Sudhakar conduits","allowancePerSqft":""},{"title":"Railing & gate","brand":"","grade":"","description":"SS 303 railing; MS gate allowance up to ₹30,000","allowancePerSqft":""},{"title":"Tanks, sump & plinth","brand":"","grade":"","description":"2,000 L double-layer overhead tank, red-brick underground sump; 2 ft plinth; floor-to-floor height 10 ft","allowancePerSqft":""},{"title":"Warranty & supervision","brand":"","grade":"","description":"Brochure references 10-year structural warranty, 1-year seepage warranty, stage-wise engineering checks and CCTV. Company must confirm and customize enforceable warranty and site-service terms.","allowancePerSqft":""}]},{"name":"Royal","code":"ROYAL","description":"Royal construction starter template. Edit its specifications, price and terms for your company. Rates are indicative until confirmed in a project quotation.","ratePerSqft":1950,"themeColor":"#B7791F","specSections":[{"title":"Architectural plans","brand":"","grade":"","description":"2D and structural plans, 3D elevation, digital survey, soil test, plumbing and electrical drawings","allowancePerSqft":""},{"title":"Steel / TMT","brand":"TATA Fe 550 TMT according to structural design","grade":"Structural engineer design","description":"Steel grade and tonnage per approved drawings.","allowancePerSqft":""},{"title":"Cement","brand":"Ultratech OPC 53 for complete construction","grade":"53 / 43 grade as listed","description":"RCC, masonry and plastering specifications.","allowancePerSqft":""},{"title":"Sand","brand":"River sand for complete construction","grade":"","description":"Construction and plastering sand.","allowancePerSqft":""},{"title":"Bricks","brand":"Karimnagar Class I bricks","grade":"","description":"","allowancePerSqft":""},{"title":"Coarse aggregates","brand":"Government-approved quarry","grade":"20 mm & 40 mm","description":"","allowancePerSqft":""},{"title":"Kitchen","brand":"Ceramic tile, steel sink and granite","grade":"","description":"2 ft ceramic wall tiles up to ₹60/sft; stainless sink up to ₹6,000; granite platform up to ₹250/sft","allowancePerSqft":""},{"title":"Main door & locks","brand":"Indian teak","grade":"","description":"Indian teak double main door up to ₹60,000 with 5×4 in frame, Godrej locks","allowancePerSqft":""},{"title":"Internal / bathroom doors","brand":"Flush laminate / WPC","grade":"","description":"Laminate flush internal doors up to ₹15,000; WPC bathroom doors up to ₹12,000","allowancePerSqft":""},{"title":"Windows","brand":"UPVC","grade":"","description":"UPVC windows with glass and mesh shutters up to ₹550/sft including fittings","allowancePerSqft":""},{"title":"Bathrooms & plumbing","brand":"","grade":"","description":"Parryware Premium fittings up to ₹50,000 per bathroom; Ashirwad hot-water CPVC; waterproof all wet areas; wall tiles up to ceiling, ₹65/sft","allowancePerSqft":""},{"title":"Flooring","brand":"","grade":"","description":"Room tiles up to ₹85/sft; staircase granite up to ₹130/sft; parking granite up to ₹70/sft","allowancePerSqft":""},{"title":"Painting","brand":"Asian / Birla as applicable","grade":"","description":"Birla wall putty 2 coats, primer 1 coat, Royal emulsion 3 coats; exterior APEX ULTIMA weatherproof paint 2 coats","allowancePerSqft":""},{"title":"Electrical","brand":"","grade":"","description":"Branded fireproof wiring and switches as specified in brochure; company should confirm chosen manufacturers","allowancePerSqft":""},{"title":"Railing & gate","brand":"","grade":"","description":"Premium railing and MS gate allowances are customizable by company","allowancePerSqft":""},{"title":"Tanks, sump & plinth","brand":"","grade":"","description":"Overhead tank, RCC sump and plinth specification to be confirmed for project","allowancePerSqft":""},{"title":"Warranty & supervision","brand":"","grade":"","description":"Brochure references 10-year structural warranty, 1-year seepage warranty, stage-wise engineering checks and CCTV. Company must confirm and customize enforceable warranty and site-service terms.","allowancePerSqft":""}]}]
$seed$::jsonb)
  loop
    v_id := null;
    insert into private.construction_quote_packages(
      organization_id,created_by,name,code,description,rate_per_sqft,status
    ) values (
      p_org,p_actor,v_row->>'name',v_row->>'code',v_row->>'description',
      (v_row->>'ratePerSqft')::numeric,'active'
    ) on conflict(organization_id,code) do nothing
      returning id into v_id;
    if v_id is not null then
      insert into private.construction_quote_package_designs(
        organization_id,package_id,theme_color,visibility,spec_sections,allowed_owner_ids
      ) values (
        p_org,v_id,v_row->>'themeColor','company',v_row->'specSections','{}'::uuid[]
      );
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count > 0 then
    insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
    values (p_actor,p_org,'construction.package.three_templates_installed',
      'construction_quote_package',p_org::text,
      pg_catalog.jsonb_build_object('created',v_count,'codes','STANDARD,PREMIUM,ROYAL'));
  end if;
  return v_count;
end $fn$;

revoke all on function private.seed_three_company_construction_templates(uuid,uuid,boolean)
  from public,anon,authenticated;

create or replace function public.construction_package_install_three_starters(p_org uuid)
returns integer language plpgsql volatile security definer set search_path='' as $fn$
begin
  perform private.require_permission(p_org,'pricing.manage');
  if not private.has_permission(p_org,'pricing.view')
    or not private.entitled(p_org,'pricing') then
    raise exception 'Pricing access required' using errcode='42501';
  end if;
  return private.seed_three_company_construction_templates(p_org,auth.uid(),false);
end $fn$;

revoke all on function public.construction_package_install_three_starters(uuid)
  from public,anon;
grant execute on function public.construction_package_install_three_starters(uuid) to authenticated;

-- Backfill only companies that have never had a construction package.
-- Existing user edits, four-tier company catalogues, and quotes remain untouched.
select private.seed_three_company_construction_templates(o.id,o.created_by,true)
from public.organizations o
join public.profiles owner_profile on owner_profile.id=o.created_by
where not exists(
  select 1 from private.construction_quote_packages existing
  where existing.organization_id=o.id
)
and not exists(
  select 1 from public.audit_logs previous
  where previous.organization_id=o.id
  and previous.action='construction.package.deleted'
);
commit;
