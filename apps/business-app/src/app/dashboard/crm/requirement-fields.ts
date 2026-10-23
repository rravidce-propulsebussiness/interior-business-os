export type RequirementType='text'|'number'|'select'|'boolean';
export type RequirementField={
 id:string;version:number;name:string;key:string;sortOrder:number;active:boolean;
 required:boolean;industryId:string|null;fieldType:RequirementType;options:string[];
};
export type RequirementIndustry={id:string;name:string;key?:string};

export function mapRequirementField(value:Record<string,unknown>):RequirementField{
 const type=value.field_type;
 return {
  id:typeof value.id==='string'?value.id:'',
  version:typeof value.version==='number'?value.version:1,
  name:typeof value.name==='string'?value.name:'',
  key:typeof value.key==='string'?value.key:'',
  sortOrder:typeof value.sort_order==='number'?value.sort_order:0,
  active:value.active!==false,
  required:value.required===true,
  industryId:typeof value.industry_id==='string'?value.industry_id:null,
  fieldType:type==='number'||type==='select'||type==='boolean'?type:'text',
  options:Array.isArray(value.options)?value.options.filter((v):v is string=>typeof v==='string'):[],
 };
}
export function requirementKey(label:string):string {
 return label.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64);
}
export function applicableFields(fields:readonly RequirementField[],industryId:string|null){
 return fields.filter(field=>field.active&&(!field.industryId||field.industryId===industryId))
  .sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
}
