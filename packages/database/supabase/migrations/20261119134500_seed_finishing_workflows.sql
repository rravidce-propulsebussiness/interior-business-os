-- Existing companies keep their own industry workflow JSON. Add the approved
-- finish-stage defaults to incomplete construction workflows without
-- replacing any company-edited item, title, order, duration or stage setting.
do $migration$
declare
  company_row record;
  stages jsonb;
  merged_stages jsonb;
  stage_row jsonb;
  stage_seed jsonb;
  stage_items jsonb;
  seed_item jsonb;
  scheduled_days integer;
  finish_seeds jsonb := '{
    "external-plastering-elevation": {
      "days": 12,
      "items": [
        {"id":"payment-external-plastering","kind":"payment","title":"External Plastering & Elevation Payment","days":0},
        {"id":"external-material-cement-sand","kind":"material","title":"Cement and clean plastering sand (approved mix)","days":0},
        {"id":"external-material-bonding-waterproofing","kind":"material","title":"Bonding agent and waterproofing admixture (if specified)","days":0},
        {"id":"external-material-mesh-beads","kind":"material","title":"Junction mesh, corner beads and drip-edge profiles (as detailed)","days":0},
        {"id":"external-material-access-safety","kind":"material","title":"Scaffolding, safety net, PPE and access equipment","days":0},
        {"id":"external-work-surface-preparation","kind":"work","title":"Inspect, clean and prepare exterior surfaces; fix junction mesh","days":2},
        {"id":"external-check-scaffold-layout","kind":"check","title":"Scaffold safety, elevation set-out and opening protection","days":0},
        {"id":"external-work-base-coat","kind":"work","title":"Apply external plaster base coat to approved thickness","days":4},
        {"id":"external-check-base-coat","kind":"check","title":"Base-coat thickness, line, level, plumb and surface bond","days":0},
        {"id":"external-work-curing-log","kind":"work","title":"Record external plaster curing and daily façade inspections","days":0,"guideText":"Log curing rounds, weather conditions, photos and any cracking. Follow the approved specification and engineer direction; do not shorten the required curing period to fit the scheduled work days."},
        {"id":"external-work-finish-coat","kind":"work","title":"Apply finish coat and approved façade texture","days":3},
        {"id":"external-work-elevation-details","kind":"work","title":"Form elevation bands, grooves, corners, sills and drip edges","days":2},
        {"id":"external-check-elevation-details","kind":"check","title":"Elevation symmetry, corner straightness, groove depth and drip direction","days":0},
        {"id":"external-work-waterproof-detailing","kind":"work","title":"Seal façade joints and apply specified weatherproof detailing","days":1},
        {"id":"external-check-waterproof-detailing","kind":"check","title":"Window edges, parapets, service penetrations and rainwater paths","days":0},
        {"id":"external-qc-façade","kind":"qc","title":"Final external plaster and elevation quality inspection","days":0}
      ]
    },
    "tiles": {
      "days": 10,
      "items": [
        {"id":"payment-tiles","kind":"payment","title":"Tiles payment","days":0},
        {"id":"tiles-material-approved","kind":"material","title":"Approved floor and wall tiles with matching batches","days":0},
        {"id":"tiles-material-adhesive","kind":"material","title":"Tile adhesive or approved cement-sand bedding mix","days":0},
        {"id":"tiles-material-grout-spacers","kind":"material","title":"Grout, spacers, levelling clips, trims and skirting tiles","days":0},
        {"id":"tiles-material-waterproofing","kind":"material","title":"Wet-area waterproofing products and protection sheets","days":0},
        {"id":"tiles-work-substrate-prep","kind":"work","title":"Prepare substrates, mark levels and set tile layout lines","days":1},
        {"id":"tiles-check-substrate","kind":"check","title":"Substrate strength, curing, flatness, level and cleanliness","days":0},
        {"id":"tiles-work-waterproofing","kind":"work","title":"Waterproof bathrooms, balconies and other specified wet areas","days":2},
        {"id":"tiles-test-waterproofing","kind":"test","title":"Wet-area ponding test and drain outlet verification","days":0},
        {"id":"tiles-qc-waterproofing","kind":"qc","title":"Waterproofing hold-point inspection before tile covering","days":0},
        {"id":"tiles-work-wall-laying","kind":"work","title":"Set out and lay bathroom, kitchen and utility wall tiles","days":2},
        {"id":"tiles-check-wall-laying","kind":"check","title":"Wall tile alignment, joint width, edge cuts and lippage","days":0},
        {"id":"tiles-work-wet-floor-laying","kind":"work","title":"Lay bathroom and balcony floor tiles to the approved falls","days":1},
        {"id":"tiles-check-wet-floor-fall","kind":"check","title":"Floor slope to drain, water flow and no ponding at corners","days":0},
        {"id":"tiles-work-room-floor-laying","kind":"work","title":"Lay room and common-area floor tiles to approved setting out","days":2},
        {"id":"tiles-check-floor-laying","kind":"check","title":"Floor levels, tile alignment, lippage and hollow spots","days":0},
        {"id":"tiles-work-skirting-thresholds","kind":"work","title":"Install skirting, thresholds and movement-joint trims","days":1},
        {"id":"tiles-check-skirting-thresholds","kind":"check","title":"Skirting height, threshold levels and doorway clearances","days":0},
        {"id":"tiles-work-grouting-cleaning","kind":"work","title":"Grout joints, clean tile faces and protect completed floors","days":1},
        {"id":"tiles-check-grout-finish","kind":"check","title":"Consistent grout fill, clean edges, unchipped tiles and protection","days":0},
        {"id":"tiles-qc-final","kind":"qc","title":"Final floor and wall tile quality inspection","days":0}
      ]
    },
    "painting": {
      "days": 10,
      "items": [
        {"id":"payment-painting","kind":"payment","title":"Painting payment","days":0},
        {"id":"painting-material-putty-primer","kind":"material","title":"Approved wall putty, interior primer and exterior primer","days":0},
        {"id":"painting-material-coats","kind":"material","title":"Approved interior paint, weather-resistant exterior paint and tint","days":0},
        {"id":"painting-material-protection","kind":"material","title":"Sandpaper, fillers, masking tape, floor covers and application tools","days":0},
        {"id":"painting-work-surface-prep","kind":"work","title":"Protect finished work; fill cracks, scrape loose material and sand","days":2},
        {"id":"painting-check-surface-prep","kind":"check","title":"Plaster dryness, moisture, cracks, smoothness and clean edges","days":0},
        {"id":"painting-work-putty","kind":"work","title":"Apply approved putty coats and sand between coats","days":2},
        {"id":"painting-check-putty","kind":"check","title":"Wall flatness, corner lines, patched areas and sanding marks","days":0},
        {"id":"painting-work-primer","kind":"work","title":"Apply interior and exterior primer to prepared surfaces","days":1},
        {"id":"painting-check-primer","kind":"check","title":"Primer coverage, adhesion and substrate readiness for top coats","days":0},
        {"id":"painting-work-interior-coats","kind":"work","title":"Apply approved interior colour coats to walls and ceilings","days":2},
        {"id":"painting-check-interior-coats","kind":"check","title":"Colour approval, uniform coverage, cut-ins and visible patching","days":0},
        {"id":"painting-work-exterior-coats","kind":"work","title":"Apply weatherproof exterior finish coats to this floor elevation","days":2},
        {"id":"painting-check-exterior-coats","kind":"check","title":"Exterior coverage, rain edges, drips, uniform colour and finish","days":0},
        {"id":"painting-work-touchups","kind":"work","title":"Complete touch-ups and remove masking after adjoining work is clear","days":1},
        {"id":"painting-check-final-finish","kind":"check","title":"Final finish in daylight; protect switches, fittings and finished floors","days":0},
        {"id":"painting-qc-final","kind":"qc","title":"Final interior and exterior painting inspection","days":0}
      ]
    }
  }'::jsonb;
begin
  for company_row in
    select organization_id, industry_workflows, milestones
    from private.organization_construction_payment_defaults
  loop
    stages := coalesce(
      company_row.industry_workflows->'construction',
      company_row.milestones,
      '[]'::jsonb
    );
    if jsonb_typeof(stages) <> 'array' then
      continue;
    end if;

    merged_stages := '[]'::jsonb;
    for stage_row in select value from jsonb_array_elements(stages)
    loop
      stage_seed := finish_seeds->(stage_row->>'id');
      if stage_seed is not null then
        stage_items := coalesce(stage_row->'items', '[]'::jsonb);
        for seed_item in select value from jsonb_array_elements(stage_seed->'items')
        loop
          if not exists (
            select 1
            from jsonb_array_elements(stage_items) as existing_items(value)
            where existing_items.value->>'id' = seed_item->>'id'
              or (
                existing_items.value->>'kind' = seed_item->>'kind'
                and lower(trim(existing_items.value->>'title')) = lower(trim(seed_item->>'title'))
              )
          ) then
            stage_items := stage_items || jsonb_build_array(seed_item);
          end if;
        end loop;
        stage_row := jsonb_set(stage_row, '{items}', stage_items, true);
        if coalesce(stage_row->>'days', '0') ~ '^[0-9]+$'
          and (stage_row->>'days')::integer = 0 then
          select coalesce(sum((item->>'days')::integer), 0)::integer
            into scheduled_days
          from jsonb_array_elements(stage_items) as scheduled_items(item)
          where scheduled_items.item->>'kind' <> 'payment';
          stage_row := jsonb_set(stage_row, '{days}', to_jsonb(scheduled_days), true);
        end if;
      end if;
      merged_stages := merged_stages || jsonb_build_array(stage_row);
    end loop;

    if exists (
      select 1 from jsonb_array_elements(stages) as stage_rows(value)
      where finish_seeds ? (stage_rows.value->>'id')
    ) then
      update private.organization_construction_payment_defaults
      set industry_workflows = jsonb_set(
        coalesce(company_row.industry_workflows, '{}'::jsonb),
        '{construction}',
        merged_stages,
        true
      )
      where organization_id = company_row.organization_id;
    end if;
  end loop;
end;
$migration$;
