# Construction BOQ from the quotation

Lead → quotation → project → BOQ:

1. A Facebook / Instagram lead form lead lands in **Leads** and gets the
   WhatsApp greeting and brochure automatically (see
   [Meta Lead Ads](META-LEAD-ADS.md)).
2. Sales prepares the floor-wise (SFT) quotation. On each floor row, enter the
   **Height (ft)**: the floor-to-floor (slab) height. It is used only for the
   BOQ and is never billed. Upper floors follow the floor below unless changed.
   Package specifications carry their pricing basis into the quote, e.g.
   _Internal doors · allowance ₹10,000 per door_, _Bathroom fittings &
   plumbing · per bathroom_, _Flooring tiles · per sq ft_.
3. When the lead is won and the project is linked to its Final quotation (or an
   agreement / contract is created for it), a **draft BOQ is generated once**
   for that project and quotation revision. Nothing is blocked if it can't be
   generated (missing estimate permission, non-floor-wise quote): open
   **Execution → BOQ**, choose the project and quotation and press
   **Generate BOQ**.

## What is generated

The BOQ runs from design to handover, floor by floor:

| Stage              | Items                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Design & approvals | Architectural & structural design (per sq ft), soil test, building permission               |
| Foundation         | Excavation, PCC, footing grid mat, optional pedestals, foundation column lift, plinth beams |
| Each floor         | Column lift, roof slab + beams, staircase, brickwork + plaster, doors, windows & shutters,  |
|                    | flooring & tiles (with bedding mortar), kitchen, painting, electrical & plumbing, labour    |
| Top floor          | + Parapet wall and terrace waterproofing                                                    |
| External works     | Compound wall (length from the quote's compound wall row, or entered), entrance gate, sump  |
|                    | (litres) and overhead tank                                                                  |
| Additional works   | Other quoted extras (sump, borewell …) with their quoted price, to break down               |
| Handover           | Final cleaning, testing & snag rectification                                                |

**Compound wall from the quote:** a compound / boundary wall row on the
quotation, in running ft or as wall area (length × height), sets the
compound wall's length and height. It is measured under External works with
its bricks, cement, sand, plaster, paint and its brickwork and plaster
labour (the built-up contract rate does not cover it), and keeps its quoted
price there instead of appearing again under Additional quoted works.

**Reopening:** the BOQ page opens the BOQ being worked on (the project's, or
the most recent one). A project's quotation has one generated BOQ: choosing
that project, or New BOQ with a single project, opens the saved one.

**Counts per floor** (editable on the BOQ before generating): main doors,
bedroom / internal doors, bathroom doors, pooja doors, windows, ventilators
bathrooms, kitchens and rolling shutters, plus entrance gates and compound wall
length. Defaults are estimated from each floor's area; enter the real counts
from the floor plan.

**Steel as per the structural design.** On the BOQ, turn on **Use the
structural drawing** and enter the engineer's schedule:

- **Columns and footings**, one row per column type: number, the floor it
  rises to (e.g. C7–C12 stop at the third floor while C1–C6 continue to the
  penthouse), size, main bars picked from lists (`6 nos × 16 mm`, or
  `4 nos × 16 mm` + `2 nos × 12 mm`), rings, footing size and mesh.
- **Beams**, one row per beam type: size, bars (`4 nos × 20 mm` + `2 nos ×
16 mm`), stirrups and the
  running feet under each floor's roof (taken off the beam layout).
- **Plinth beam** running feet.
- **This drawing's settings**, grouped as on the drawing: slab (thickness,
  main and distribution bars), plinth beam (size, bars and stirrups),
  staircase (width, riser, tread, landing, waist and bars) and covers
  (general, footing, column, beam and slab; blank = the general cover). A
  stair beam is entered as a beam type with its running feet per floor.

Footings, every column lift and every roof's beams are then quantified type
by type, with the same 2-per-bar foundation and 3-per-bar floor cuts and
laps, each element bent inside its own cover. Settings left as they are come
from the structural rules (Configure rates). Without a schedule, the column grid and
bar rules in Configure rates are used. A floor quoted as parking + shop keeps
its real frontage and depth.

**Purchase units:** cement in bags, bricks in numbers, sand and aggregate in
tonnes (from m³ using the density in the structural rules), steel in rods of
each diameter (weight shown alongside). Rates are entered in the same units.

**What comes from the quotation.** When the lead is won and the project is
created, the BOQ takes everything the Final quotation holds: floors, sizes,
slab (floor) heights, parking, and the package's rates. Package items are
priced at the quoted package rate, applied to the quantities measured on the
BOQ. For example, a standard package with windows at ₹450 / sq ft and window
sizes `2×4×4, 2×4×6` on a floor gives 80 sq ft × ₹450. The same applies to
tiles, granite, kitchen platform and sink, doors per door, bathroom fittings
per bathroom, rolling shutter, gate and painting. A different package on the
quote gives different rates. Items the package does not price (steel,
cement, sand, aggregate, bricks, labour …) come from the rate card
(Configure rates). Any rate can be typed over on the BOQ. Quoted items with
no rate (other allowances, additional quoted works) start at zero: type
their cost. The page shows the quotation value, the BOQ cost and the margin.

**Window sizes:** in the counts table, type each floor's windows as on the
plan, `nos × width × height` in feet, e.g. `2×4×4, 2×4×6`. The window count
and area follow; without sizes, a typical window size is assumed.

**Cost estimate, floor by floor:** the BOQ opens with each stage's cost and
₹ / sq ft and the total project cost. Open a floor to see it in simple heads:
M20 concrete (m³ × rate), cement (bags × rate), sand and aggregate (tonnes ×
rate), steel (kg × rate), bricks (nos × rate), structural labour (₹400 × the
floor's sq ft), then doors & windows, flooring & tiles, painting, electrical,
plumbing & sanitary. The item-by-item takeoff is under **Show detailed
takeoff**, where any quantity or rate can be edited.

**Labour:** one structural labour contract rate, ₹400 / sq ft built-up,
covers shuttering, concreting, brickwork and plastering (Configure rates →
Labour). Tile laying, painting, electrical and plumbing labour are priced
with their trades. To price each structural trade separately, set _Labour:
one contract rate (0) or itemized (1)_ to 1.

**Concrete:** footings, columns, beams, slabs and stairs are M20 ready-mix at
₹5,000 / m³ (plus wastage). Set _RCC concrete: ready-mix (1) or site mix
(0)_ to 0 to quantify cement, sand and aggregate instead. PCC, brickwork,
plaster and tile bedding always use cement and sand.

**Entering details (no drawing needed).** Most projects have no drawing in
the system, so everything is typed on the BOQ, floor by floor. Every feet box
takes sizes exactly as written on the plan: `11'3"`, `11'3`, `11-3` or
`11.25` (the box shows "= 11.25 ft"). Text that is not a size is marked in red
and never guessed (`7'0"` is never read as 70 ft).

- **Doors & windows:** main, internal, bathroom and pooja doors, windows with
  sizes (`2×4×4, 2×4×6`), ventilators, rolling shutters.
- **Bathrooms & kitchens:** how many, each bathroom's size as drawn
  (`7'0x6'9, 4'6x6'0, 6'0x6'6, 6'0x5'0`, which also sets the count; one size
  = every bathroom on the floor) and the kitchen platform length. Tiles and
  waterproofing are measured bathroom by bathroom; a count that differs from
  the sizes (bathrooms or windows) is shown as a warning.
- **Electrical points:** light, fan, 6 A socket and 16 A power points (geyser,
  AC). Points not typed follow the rooms entered.
- **Rooms to tile:** each room's size as on the plan (Living hall `19'9"` ×
  `11'8"`, Bedroom 10×12 …).
- **Structural drawing** (optional): column and beam types with bars picked
  from lists (`4 nos × 16 mm` + `2 nos × 12 mm`), footings, slab and staircase.

**What is calculated from them**

- **Tiles:** room flooring (rooms + skirting), bathroom floor (anti-skid) and
  walls up to door height, kitchen wall tiles above the platform, parking
  tiles, staircase and kitchen granite in sq ft. Each tile line says what to
  order, e.g. _264 tiles of 2×2 ft · 66 boxes of 4_. Tile sizes, tiles per
  box, skirting height and wastage are in Configure rates → Tiles.
- **Electrical:** 1.5 / 2.5 / 4 sq mm wire in 90 m coils, 6 sq mm feeder
  from the meter, conduit pipes, 6 A and 16 A switches and sockets, fan
  regulators, switch boards, distribution board and MCBs, labour per point.
  Light fittings and fans are the customer's.
- **Plumbing:** CPVC ½ in pipes and fittings per water point (6 per
  bathroom, 2 per kitchen), CPVC 1 in risers, concealed valves, SWR 110 mm
  soil and stacks, 75 mm waste, floor / nahani traps, SWR fittings,
  rainwater pipes, sundries, bathroom waterproofing and labour. Sanitary
  ware and CP fittings are priced at the quote's allowance per bathroom
  (accessories only).

The floor-wise estimate shows each trade on its own: concrete, cement, sand,
aggregate, steel, bricks, excavation, structural labour, doors & windows,
room tiles, bathroom tiles, kitchen, staircase granite, parking tiles, tile
laying, painting, electrical, plumbing, sanitary fittings, waterproofing, with
the order list (tiles and boxes) under each floor.

**Default prices** (editable, Configure rates; Hyderabad, Nov 2026 — confirm
with your suppliers):

| Item                   | Default                                                        |
| ---------------------- | -------------------------------------------------------------- |
| Steel per 12 m rod     | from ₹/kg × rod weight: Vizag ₹68, JSW ₹72, local ISI ₹60 / kg |
| Cement (RCC)           | UltraTech 53 ₹390, Birla 53 ₹360, Maha 53 ₹350 / bag           |
| Cement (masonry)       | Birla 43 ₹330, UltraTech 43 ₹360, Maha 43 ₹320 / bag           |
| Bricks                 | Karimnagar ₹9.5, local ₹8.5 each                               |
| Sand / aggregate       | River ₹1,750, M-sand ₹1,300, aggregate ₹750 / t                |
| Structural labour      | ₹400 / sq ft built-up (contract)                               |
| M20 ready-mix concrete | ₹5,000 / m³                                                    |
| Brickwork labour       | 9 in ₹30, 4.5 in ₹19 / sq ft of wall                           |
| Plaster, centering     | ₹22, ₹35 / sq ft                                               |
| Tiles, painting labour | ₹70, ₹15 / sq ft                                               |
| Electrical, plumbing   | ₹300 / point, ₹15,000 / bathroom (labour)                      |
| Plumbing materials     | ₹9,000 supply + ₹7,000 drainage per wet area, ₹12,000 / floor  |
| Sump, overhead tank    | ₹18 / litre, ₹29,000 (4,000 L)                                 |
| Design, soil, cleaning | ₹20 / sq ft, ₹15,000, ₹5 / sq ft                               |

Doors, windows, tiles, fittings, granite, sink, shutter and gate start at
the standard package values and take the quote's package rate when it has
one. Every quantity can be edited. **Regenerate BOQ** replaces only the generated
lines; manual lines are kept.

### Steel floor by floor, with laps

The structural BOQ is grouped by stage, **Foundation**, **Ground Floor**,
**First Floor** …, so steel is brought for one stage at a time. Each stage
has its column lift, beams, slab, masonry and binding wire, and the BOQ shows
the bars of each size to bring per stage.

Stock bars are 40 ft (12 m). Column bars are jointed with a lap just above
every floor level:

- **Foundation**: always one bar cut into **2** (20 ft pieces), with an
  L-bend into the footing. If 20 ft reaches the ground-floor roof plus the lap
  (normal foundation depth), the foundation bars also form the ground-floor
  columns. If the foundation is deeper, they stop one lap above plinth and the
  ground floor gets its own lift (a warning says so).
- **Each floor above**: floor height + lap, one bar cut into **3** (13.33 ft
  pieces). With a 10 ft floor and 16 mm bars, the lap is 50 × 16 mm = 2.62 ft,
  so 12.62 ft is needed and 3 pieces fit.
- If a taller floor needs more than the usual piece (e.g. 11 ft + 2.62 ft =
  13.62 ft), 2 pieces are taken from each bar for that floor and the BOQ shows
  a warning, so the lap is never short.

Steel weights are whole bars to buy (offcuts are wastage).

All assumptions — bar length, cuts per bar, lap (× diameter), cover,
foundation depth, column grid and size, bar diameters and spacings, slab
thickness, wall thickness, openings, bricks per m³, door / bathroom estimates
— are company settings on **BOQ → Configure rates**.

### Foundation: footing grid mat, pedestal, column, plinth beam

The Foundation stage follows the build order: excavation and PCC, footing
**grid mat** (bars both ways), optional **pedestals** (set a pedestal height
in the structural rules; 0 means none), the foundation column lift and
**plinth beams**. Column bars run through the pedestal from the footing, so
a pedestal adds its own concrete and rings only.

For manual takeoffs the same order is available as templates: Footing (grid
mat), Pedestal, RCC column, Plinth beam.

## Metres or feet

Choose the company default under **BOQ → Configure rates → Measurement
units**. Anyone can switch between **Metres** and **Feet** at the top of the
BOQ page; the choice is remembered on that browser. With feet, lengths are
typed in ft, areas in sq ft and bar spacing in inches; bar diameters stay in
mm. Quantities, rates and saved BOQs don't change when the unit changes:
everything is stored in metric.

## Prices by brand and source

**Configure rates** has one list per material with several brands or sources:
Steel (JSW, Vizag …), Cement (UltraTech, Maha …), Bricks (Local, Karimnagar),
Sand (River, M-sand) and so on. The ★ default is used unless a BOQ picks
another in **Brand & source for this BOQ**. Changing a rate or choice reprices
the BOQ immediately; quoted allowances keep the quoted value.

**Brands from the quotation:** when the BOQ is generated, brands named in the
quote's specifications are picked automatically, e.g. _Steel / TMT · Vizag /
JSW_ → Vizag, _Cement · UltraTech 53, Birla 43_ → UltraTech 53 for RCC and
Birla 43 for masonry, _Bricks · Karimnagar_ → Karimnagar. A choice already
made on the BOQ is kept.

## Order list, download and print

- **Materials & work to order, whole project:** below the floor-wise
  estimate, every stage is added up into one purchase list grouped by head
  (cement bags, sand and aggregate tonnes, steel rods per size with weight,
  bricks, tiles, electrical and plumbing items …), with the amount and the
  stages that need each item.
- **Download Excel (CSV):** the full BOQ stage by stage (item, material,
  quantity, unit, rate, amount and what to order), each stage's total, the
  whole-project order list, the total cost, cost per sq ft, quotation value
  and margin. It opens in Excel or Google Sheets. People without rate access
  get quantities only.
- **Print / PDF:** prints only the BOQ, with every floor opened; choose
  _Save as PDF_ in the print dialog to share it.

These are pre-design estimates. Final procurement follows the structural
engineer's drawings and bar bending schedule.
