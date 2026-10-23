import {z} from 'zod';
export const companyConstructionPaymentRows=z.array(z.object({
 name:z.string().trim().min(2).max(100),
 percent:z.union([z.number(),z.string()]).transform(value=>Number(value))
  .pipe(z.number().finite().positive().max(100)),
}).strict()).min(1).max(40).superRefine((rows,ctx)=>{
 if(Math.abs(rows.reduce((sum,item)=>sum+item.percent,0)-100)>0.001)
  ctx.addIssue({code:'custom',message:'Total payment percentage must be exactly 100%'});
});
export type CompanyConstructionPaymentRow=z.infer<typeof companyConstructionPaymentRows>[number];
export function applyCompanyPaymentDefaults(
 suggested:readonly {name:string;percent:string;stageCodes:string[]}[],
 defaults:readonly CompanyConstructionPaymentRow[],
):{name:string;percent:string;stageCodes:string[]}[] {
 if(!defaults.length||defaults.length!==suggested.length)return suggested.map(x=>({
  ...x,stageCodes:[...x.stageCodes],
 }));
 // Never copy stale stage/floor IDs from company defaults: preserve the actual
 // floor/stage associations calculated for this new quotation.
 return suggested.map((row,i)=>({
  ...row,name:defaults[i]!.name,percent:String(defaults[i]!.percent),
  stageCodes:[...row.stageCodes],
 }));
}
