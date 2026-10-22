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

/** Small, transparent work-specific suggestions, never an automatic BOQ or purchase order.
 * Site staff must confirm the actual item, brand, size, quantity and approval.
 * The stage's full material catalogue stays available in the request dropdown.
 */
export function suggestedActivityMaterials(workTitle:string,stageSuggestions:readonly string[]):string[]{
 const title=workTitle.toLowerCase();
 // Inspection-only hold points need evidence and sign-off, not an assumed material order.
 if(/structural inspection|qc clearance|quality clearance/.test(title))return [];
 const rules:{activity:RegExp;materials:RegExp;extra?:string[]}[]=[
  {activity:/layout|dimension|marking|set.out|grid line|survey|level verification/,
   materials:/marking|pegs|stakes|nylon|thread|lime|chalk/,
   extra:['Marking lime / chalk powder','Nylon line / marking thread','Site marking pegs']},
  {activity:/\bpcc\b|concrete|concreting|curing/,
   materials:/cement|aggregate|sand|ready.mix|admixture/},
  {activity:/steel|reinforcement|bar bending|bar spacing|binding|anchorage|laps|stirrups/,
   materials:/\btmt\b|steel|binding wire|cover blocks/},
  {activity:/shuttering|formwork|props|scaffolding/,
   materials:/shuttering|plywood|formwork|props|scaffolding/},
  {activity:/sump|termite|soil compaction|filling|waterproof|treatment/,
   materials:/chemical|anti.termite|waterproof|murram|soil|membrane/},
  {activity:/masonry|brick|blockwork|wall/,
   materials:/brick|block|cement|sand|mortar/},
  {activity:/plaster|putty|rendering/,
   materials:/cement|sand|plaster|putty/},
  {activity:/plumbing|pipe|drain|sanitary/,
   materials:/pipe|fitting|plumbing|drain/},
  {activity:/electrical|wiring|conduit/,
   materials:/conduit|wire|electrical|boxes|clips/},
  {activity:/tile|flooring|grout/,
   materials:/tile|adhesive|grout|spacer|levelling/},
  {activity:/door|frame|shutter|lock/,
   materials:/door|frame|shutter|hinge|lock|handle/},
  {activity:/paint|primer|emulsion/,
   materials:/paint|primer|emulsion|putty/},
 ];
 const matched=rules.filter(rule=>rule.activity.test(title));
 if(!matched.length)return [];
 const selected=[...stageSuggestions.filter(item=>matched.some(rule=>rule.materials.test(item.toLowerCase()))),
  ...matched.flatMap(rule=>rule.extra??[])];
 return [...new Set(selected)].slice(0,12);
}
