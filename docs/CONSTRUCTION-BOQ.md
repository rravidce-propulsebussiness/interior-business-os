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

| Section            | From                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| Foundation         | Footings on the column grid: excavation, PCC 1:4:8, M20 concrete, footing mesh steel |
| Columns            | Column count from each floor footprint; steel cut lift by lift (below)               |
| Plinth / slabs     | Beams along every grid line + slab bars, concrete, centering & shuttering            |
| Masonry            | External and internal walls per floor height, bricks, mortar, plaster                |
| Finishes, fittings | Package allowances × quantity (doors, bathrooms, tile area, windows …)               |
| Additional works   | Quote's additional rows (compound wall, sump …) with their quoted price, to detail   |

Everything else is added manually with the existing takeoff templates.
Quantities on every line can be edited. **Regenerate BOQ** replaces only the
generated lines; manual lines are kept.

### Column steel and laps

Stock bars are 40 ft (12 m). Each column bar is cut per lift:

- **Foundation lift**: footing → plinth → ground floor + lap (+ L-bend into the
  footing). Usual practice: one bar cut into **2** (20 ft pieces).
- **Each floor above**: floor height + lap. Usual practice: one bar cut into
  **3** (13.33 ft pieces). With a 10 ft floor and 16 mm bars, the lap is
  50 × 16 mm = 2.62 ft, so 12.62 ft is needed and 3 pieces fit.
- If a taller floor needs more than the usual piece (e.g. 11 ft + 2.62 ft =
  13.62 ft), fewer pieces are taken from each bar (2 per bar) and the BOQ shows
  a warning, so the lap is never short.

Steel weights are whole bars to buy (offcuts are wastage), summarised by
bar size in the BOQ.

All assumptions — bar length, cuts per bar, lap (× diameter), cover,
foundation depth, column grid and size, bar diameters and spacings, slab
thickness, wall thickness, openings, bricks per m³, door / bathroom estimates
— are company settings on **BOQ → Configure rates**.

## Prices by brand and source

**Configure rates** has one list per material with several brands or sources:
Steel (JSW, Vizag …), Cement (UltraTech, Maha …), Bricks (Local, Karimnagar),
Sand (River, M-sand) and so on. The ★ default is used unless a BOQ picks
another in **Brand & source for this BOQ**. Changing a rate or choice reprices
the BOQ immediately; quoted allowances keep the quoted value.

These are pre-design estimates. Final procurement follows the structural
engineer's drawings and bar bending schedule.
