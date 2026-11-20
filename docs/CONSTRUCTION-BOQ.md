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

| Stage              | Items                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Design & approvals | Architectural & structural design (per sq ft), soil test, building permission                     |
| Foundation         | Excavation, PCC, footing grid mat, optional pedestals, foundation column lift, plinth beams       |
| Each floor         | Column lift, roof slab + beams, brickwork + plaster, doors & windows, flooring & tiles, painting, |
|                    | electrical & plumbing, civil labour                                                               |
| Top floor          | + Parapet wall and terrace waterproofing                                                          |
| External works     | Compound wall (length from the quote's compound wall row, or entered), entrance gate              |
| Additional works   | Other quoted extras (sump, borewell …) with their quoted price, to break down                     |
| Handover           | Final cleaning, testing & snag rectification                                                      |

**Counts per floor** (editable on the BOQ before generating): main doors,
bedroom / internal doors, bathroom doors, pooja doors, windows, ventilators
and bathrooms, plus entrance gates and compound wall length. Defaults are
estimated from each floor's area.

**Purchase units:** cement in bags, bricks in numbers, sand and aggregate in
tonnes (from m³ using the density in the structural rules), steel in rods of
each diameter (weight shown alongside). Rates are entered in the same units.

**Package allowances** from the quotation (₹ per door, per bathroom, per sq
ft …) price the matching counted items on every floor: main / internal /
bathroom / pooja doors, windows, ventilators, gates, floor and wall tiles,
painting, electrical points, sanitary & CP fittings, plumbing. A generic
"Internal doors" allowance also covers bathroom and pooja doors unless they
have their own. Items without an allowance are priced from the rate card.

**Labour defaults** (editable, Configure rates → Labour): civil labour
₹350/sq ft built-up (concrete, brickwork, plastering), centering ₹35/sq ft,
tile laying ₹70/sq ft, painting ₹15/sq ft, electrical ₹300/point, plumbing
₹15,000/bathroom (estimate), door fixing ₹1,500/door; design ₹20/sq ft, soil
test ₹15,000, final cleaning ₹5/sq ft. Material prices start blank.

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

These are pre-design estimates. Final procurement follows the structural
engineer's drawings and bar bending schedule.
