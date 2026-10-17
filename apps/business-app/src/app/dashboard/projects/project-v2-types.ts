export type ProjectEntry = {
 id:string;name:string;code:string;status:string;projectType:string;address:string;
 createdAt:string;client:string;industry:string;progress:number|null;customerId:string|null;
};
export function pretty(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
