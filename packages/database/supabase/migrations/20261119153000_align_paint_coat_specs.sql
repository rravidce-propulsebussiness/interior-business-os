-- Keep new quotation package specs and existing default painting workflows in
-- sync with the confirmed scope: two interior finish coats and one exterior.
-- Only exact starter text/items are updated; edited company specs are retained.
begin;

with updated_designs as (
  update private.construction_quote_package_designs design
  set spec_sections = (
    select jsonb_agg(
      case
        when section.value->>'title' <> 'Painting' then section.value
        else case section.value->>'description'
        when 'Asian wall putty 2 coats, primer 1 coat, Asian Tractor emulsion 2 coats; exterior ACE emulsion 2 coats' then
          jsonb_set(section.value, '{description}', to_jsonb('Asian wall putty 2 coats, primer 1 coat, Asian Tractor emulsion 2 coats; exterior ACE emulsion 1 coat'::text), true)
        when 'Birla wall putty 2 coats, primer 1 coat, Asian Premium Emulsion 2 coats; exterior ACE emulsion 2 coats' then
          jsonb_set(section.value, '{description}', to_jsonb('Birla wall putty 2 coats, primer 1 coat, Asian Premium Emulsion 2 coats; exterior ACE emulsion 1 coat'::text), true)
        when 'Birla wall putty 2 coats, primer 1 coat, Asian Royale 2 coats; exterior APEX emulsion 2 coats' then
          jsonb_set(section.value, '{description}', to_jsonb('Birla wall putty 2 coats, primer 1 coat, Asian Royale 2 coats; exterior APEX emulsion 1 coat'::text), true)
        when 'Birla wall putty 2 coats, primer 1 coat, Royal emulsion 3 coats; exterior APEX ULTIMA weatherproof paint 2 coats' then
          jsonb_set(section.value, '{description}', to_jsonb('Birla wall putty 2 coats, primer 1 coat, Royal emulsion 2 coats; exterior APEX ULTIMA weatherproof paint 1 coat'::text), true)
        else section.value
        end
      end order by section.ordinality
    )
    from jsonb_array_elements(design.spec_sections) with ordinality as section(value, ordinality)
  )
  where exists (
    select 1
    from jsonb_array_elements(design.spec_sections) as section(value)
    where section.value->>'title' = 'Painting'
      and section.value->>'description' in (
        'Asian wall putty 2 coats, primer 1 coat, Asian Tractor emulsion 2 coats; exterior ACE emulsion 2 coats',
        'Birla wall putty 2 coats, primer 1 coat, Asian Premium Emulsion 2 coats; exterior ACE emulsion 2 coats',
        'Birla wall putty 2 coats, primer 1 coat, Asian Royale 2 coats; exterior APEX emulsion 2 coats',
        'Birla wall putty 2 coats, primer 1 coat, Royal emulsion 3 coats; exterior APEX ULTIMA weatherproof paint 2 coats'
      )
  )
  returning design.organization_id, design.package_id
)
update private.construction_quote_packages package
set version = package.version + 1
from updated_designs
where package.organization_id = updated_designs.organization_id
  and package.id = updated_designs.package_id;

do $migration$
declare
  company_row record;
  stages jsonb;
  stage_rows jsonb;
  stage_row jsonb;
  original_items jsonb;
  updated_items jsonb;
  item jsonb;
begin
  for company_row in
    select organization_id, industry_workflows
    from private.organization_construction_payment_defaults
    where jsonb_typeof(industry_workflows->'construction') = 'array'
  loop
    stages := company_row.industry_workflows->'construction';
    stage_rows := '[]'::jsonb;
    for stage_row in select value from jsonb_array_elements(stages)
    loop
      if stage_row->>'id' = 'painting' then
        original_items := coalesce(stage_row->'items', '[]'::jsonb);
        updated_items := '[]'::jsonb;
        for item in select value from jsonb_array_elements(original_items)
        loop
          if item->>'id' = 'painting-material-putty-primer'
            and item->>'title' = 'Approved wall putty, interior primer and exterior primer' then
            item := jsonb_set(item, '{title}', to_jsonb('Approved wall putty (2 coats) and primer (1 coat)'::text), true);
          elsif item->>'id' = 'painting-material-coats'
            and item->>'title' = 'Approved interior paint, weather-resistant exterior paint and tint' then
            item := jsonb_set(item, '{title}', to_jsonb('Approved interior paint (2 coats) and exterior paint (1 coat)'::text), true);
            if not (item ? 'guideText') then
              item := jsonb_set(item, '{guideText}', to_jsonb('Use the brand and finish in the accepted quotation. Scope is two interior finish coats and one weatherproof exterior finish coat; primer and putty coats are listed separately.'::text), true);
            end if;
          elsif item->>'id' = 'painting-work-putty'
            and item->>'title' = 'Apply approved putty coats and sand between coats' then
            item := jsonb_set(item, '{title}', to_jsonb('Apply 2 approved wall putty coats and sand between coats'::text), true);
          elsif item->>'id' = 'painting-work-primer'
            and item->>'title' = 'Apply interior and exterior primer to prepared surfaces' then
            item := jsonb_set(item, '{title}', to_jsonb('Apply 1 primer coat to prepared interior and exterior surfaces'::text), true);
          elsif item->>'id' = 'painting-work-interior-coats'
            and item->>'title' = 'Apply approved interior colour coats to walls and ceilings' then
            item := jsonb_set(item, '{title}', to_jsonb('Apply 2 approved interior colour coats to walls and ceilings'::text), true);
          elsif item->>'id' = 'painting-check-interior-coats'
            and item->>'title' = 'Colour approval, uniform coverage, cut-ins and visible patching' then
            item := jsonb_set(item, '{title}', to_jsonb('Verify 2 interior coats, approved colour, uniform coverage and cut-ins'::text), true);
          elsif item->>'id' = 'painting-work-exterior-coats'
            and item->>'title' = 'Apply weatherproof exterior finish coats to this floor elevation' then
            item := jsonb_set(item, '{title}', to_jsonb('Apply 1 weatherproof exterior finish coat to this floor elevation'::text), true);
            item := jsonb_set(item, '{days}', '1'::jsonb, true);
          elsif item->>'id' = 'painting-check-exterior-coats'
            and item->>'title' = 'Exterior coverage, rain edges, drips, uniform colour and finish' then
            item := jsonb_set(item, '{title}', to_jsonb('Verify 1 exterior coat covers the elevation, rain edges, drips and joints'::text), true);
          elsif item->>'id' = 'painting-work-touchups'
            and item->>'title' = 'Complete touch-ups and remove masking after adjoining work is clear'
            and item->>'days' = '1' then
            item := jsonb_set(item, '{days}', '2'::jsonb, true);
          elsif item->>'id' = 'painting-check-final-finish'
            and item->>'title' = 'Final finish in daylight; protect switches, fittings and finished floors' then
            item := jsonb_set(item, '{title}', to_jsonb('Confirm 2 interior coats and 1 exterior coat; protect fittings and floors'::text), true);
          elsif item->>'id' = 'painting-qc-final'
            and item->>'title' = 'Final interior and exterior painting inspection' then
            item := jsonb_set(item, '{title}', to_jsonb('Final painting QC: 2 interior coats and 1 exterior coat'::text), true);
          end if;
          updated_items := updated_items || jsonb_build_array(item);
        end loop;
        stage_row := jsonb_set(stage_row, '{items}', updated_items, true);
        if stage_row->>'description' = 'Surface preparation, putty, primer, interior and exterior paint coats, touch-ups and QC.' then
          stage_row := jsonb_set(stage_row, '{description}', to_jsonb('Two interior paint coats and one exterior paint coat, with surface preparation and QC.'::text), true);
        end if;
      end if;
      stage_rows := stage_rows || jsonb_build_array(stage_row);
    end loop;
    update private.organization_construction_payment_defaults
    set industry_workflows = jsonb_set(
      company_row.industry_workflows,
      '{construction}',
      stage_rows,
      true
    )
    where organization_id = company_row.organization_id;
  end loop;
end;
$migration$;

commit;
