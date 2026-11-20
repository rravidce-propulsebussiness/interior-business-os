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

**Counts per floor** (editable on the BOQ before generating): main doors,
bedroom / internal doors, bathroom doors, pooja doors, windows, ventilators
bathrooms, kitchens and rolling shutters, plus entrance gates and compound wall
length. Defaults are estimated from each floor's area; enter the real counts
from the floor plan.

**Steel as per the structural design.** On the BOQ, turn on **Use the
structural drawing** and enter the engineer's schedule:

- **Columns and footings**, one row per column type: number, the floor it
  rises to (e.g. C7–C12 stop at the third floor while C1–C6 continue to the
  penthouse), size, main bars as written on the drawing (`6-16`,
  `4-16+2-12`), rings, footing size and mesh.
- **Beams**, one row per beam type: size, bars (`4-20+2-16`), stirrups and the
  running feet under each floor's roof (taken off the beam layout).
- **Plinth beam** running feet.

Footings, every column lift and every roof's beams are then quantified type
by type, with the same 2-per-bar foundation and 3-per-bar floor cuts and
laps. Slab, staircase, plinth-beam section and covers come from the
structural rules (Configure rates). Without a schedule, the column grid and
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

**Floor-wise cost estimate:** each stage lists every item as quantity × rate
= amount (cement bags, sand and aggregate tonnes, steel rods per size,
bricks, paint, each labour trade …), labour per sq ft, the floor total and
₹ / sq ft, then the total project cost.

**Default prices** (editable, Configure rates; Hyderabad, Nov 2026 — confirm
with your suppliers):

| Item                   | Default                                                        |
| ---------------------- | -------------------------------------------------------------- |
| Steel per 12 m rod     | from ₹/kg × rod weight: Vizag ₹68, JSW ₹72, local ISI ₹60 / kg |
| Cement (RCC)           | UltraTech 53 ₹390, Birla 53 ₹360, Maha 53 ₹350 / bag           |
| Cement (masonry)       | Birla 43 ₹330, UltraTech 43 ₹360, Maha 43 ₹320 / bag           |
| Bricks                 | Karimnagar ₹9.5, local ₹8.5 each                               |
| Sand / aggregate       | River ₹1,750, M-sand ₹1,300, aggregate ₹750 / t                |
| RCC labour             | ₹120 / sq ft built-up (steel fixing, concreting)               |
| Brickwork labour       | 9 in ₹30, 4.5 in ₹19 / sq ft of wall                           |
| Plaster, centering     | ₹22, ₹35 / sq ft                                               |
| Tiles, painting labour | ₹70, ₹15 / sq ft                                               |
| Electrical, plumbing   | ₹300 / point, ₹15,000 / bathroom                               |
| Sump, overhead tank    | ₹18 / litre, ₹29,000 (4,000 L)                                 |
| Design, soil, cleaning | ₹20 / sq ft, ₹15,000, ₹5 / sq ft                               |

Labour is itemized by default (RCC, brickwork, plaster, centering, tiling,
painting …). Set **Labour: itemized** to 0 to use one civil labour contract
rate (₹350/sq ft) instead. Doors, windows, tiles, fittings, granite, sink,
shutter and gate start at the standard package values; replace them with
your purchase prices.

The BOQ shows the **estimate by stage** with the total and cost per sq ft.
Every quantity can be edited. **Regenerate BOQ** replaces only the generated
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

These are pre-design estimates. Final procurement follows the structural
engineer's drawings and bar bending schedule.
