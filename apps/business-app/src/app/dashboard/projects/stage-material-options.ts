/** Optional suggestions only. The site engineer must enter actual
 * quantities, grade, sizes and brand from the approved specification.
 * These examples never imply a purchase, BOQ allowance or available stock.
 */
const materials:Record<string,string[]>={
 SITE_PREP:[
 'Marking lime / chalk powder','Site marking pegs','Nylon line / marking thread',
 'Survey stakes / reference markers','Barricade tape / safety net','Temporary safety barricades',
 'Excavation shoring materials','Dewatering hose / pipes','Protective tarpaulin',
 ],
 FOUNDATION:[
 'PCC cement','Coarse aggregate','Fine aggregate / M-sand',
 'TMT steel 8 mm','TMT steel 10 mm','TMT steel 12 mm','TMT steel 16 mm',
 'TMT steel 20 mm','Binding wire','Cover blocks','Shuttering plywood',
 'Formwork props','Concrete admixture','Waterproofing chemicals',
 ],
 PLINTH:[
 'TMT steel 8 mm','TMT steel 10 mm','TMT steel 12 mm','Binding wire',
 'Cement','Sand','Aggregates','Murram / filling soil','Anti-termite chemical','Waterproofing membrane',
 ],
 RCC:[
 'TMT steel 8 mm','TMT steel 10 mm','TMT steel 12 mm','TMT steel 16 mm',
 'TMT steel 20 mm','TMT steel 25 mm','Binding wire','Ready-mix concrete',
 'Cement','Sand','Coarse aggregate','Shuttering plywood','Scaffolding / props',
 'Electrical conduits','Cover blocks',
 ],
 MASONRY:[
 'Red clay bricks','AAC blocks','Solid concrete blocks','Cement','M-sand',
 'Door frames','Lintel concrete','Anchor fasteners',
 ],
 INTERNAL_PLASTER:[
 'Cement','Plaster sand','Gypsum plaster','PVC electrical conduits',
 'Electrical boxes','CPVC plumbing pipes','UPVC drain pipes','Fittings',
 ],
 EXTERNAL_PLASTER:[
 'Cement','Plaster sand','Scaffolding','Waterproofing compound',
 'Exterior primer','Elevation finishing materials',
 ],
 PLUMBING_PAINT:[
 'CPVC pipes','UPVC pipes','Plumbing fittings','Waterproofing compound',
 'Wall putty','Primer','Interior emulsion paint','Exterior paint','Electrical accessories',
 ],
 TILES:[
 'Floor tiles','Wall tiles','Tile adhesive','Tile grout','Tile spacers','Tile levelling clips',
 ],
 DOORS:[
 'Door frames','Door shutters','Hinges','Mortise locks','Door handles','Door stoppers',
 ],
};
export function suggestedStageMaterials(stageCode:string):readonly string[]{
 return materials[stageCode]??[];
}
