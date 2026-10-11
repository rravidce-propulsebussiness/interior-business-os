import { z } from 'zod';

/** Prices are INR per built-up square foot; lengths and widths are feet. */
const positive = z.string().regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?$/)
  .refine(value=>Number(value)>0,'Enter a positive dimension');
const rate = z.string().regex(/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/);
export const sftEstimateInputSchema = z.object({
  rows: z.array(z.object({
    name:z.string().trim().min(2).max(90),
    lengthFeet:positive,
    widthFeet:positive,
    ratePerSqft:rate,
  }).strict()).min(1).max(12),
  materialIds:z.array(z.uuid()).max(20).refine(x=>new Set(x).size===x.length),
}).strict();

export const sftMaterialSchema=z.object({
  category:z.string().min(1).max(50),
  name:z.string().min(1).max(120),
  specification:z.string().max(250),
}).strict();

const detailSchema=z.object({
  rows:z.array(z.object({
    name:z.string().min(2).max(90),
    lengthFeet:positive,
    widthFeet:positive,
    areaSqft:z.string(),
    ratePerSqft:rate,
    amount:z.string(),
  }).strict()).min(1).max(12),
  totalAreaSqft:z.string(),
  total:z.string(),
  materials:z.array(sftMaterialSchema).max(20),
}).strict();
export type SftEstimateDetails=z.infer<typeof detailSchema>;
export const SFT_ESTIMATE_PREFIX='SFT_ESTIMATE_V1:';

const hundredths=(value:string)=>{
  const [whole,fraction='']=value.split('.');
  return BigInt(whole!)*100n+BigInt((fraction+'00').slice(0,2));
};
const decimal=(value:bigint)=>{
  const integer=value/100n;
  const fractional=(value%100n).toString().padStart(2,'0');
  return integer+'.'+fractional;
};

export function calculateSftEstimate(
  raw:unknown, materialOptions:unknown=[],
):SftEstimateDetails{
  const input=sftEstimateInputSchema.parse(raw);
  const materials=z.array(sftMaterialSchema).max(20).parse(materialOptions);
  if(materials.length!==input.materialIds.length)throw new Error('Unavailable material selections');
  let totalArea=0n;
  let totalAmount=0n;
  const rows=input.rows.map(row=>{
    const length=hundredths(row.lengthFeet);
    const width=hundredths(row.widthFeet);
    const area=(length*width+50n)/100n; // round sq-ft to 2 decimals
    if(area<=0n||area>100000000n)throw new Error('Invalid calculated built-up area');
    const amount=(area*hundredths(row.ratePerSqft)+50n)/100n; // INR paise, half-up
    totalArea+=area;
    totalAmount+=amount;
    if(totalAmount>99999999999999n)throw new Error('Estimate amount too large');
    return {...row,areaSqft:decimal(area),amount:decimal(amount)};
  });
  if(totalAmount<=0n)throw new Error('Enter at least one positive construction rate');
  return detailSchema.parse({
    rows,totalAreaSqft:decimal(totalArea),total:decimal(totalAmount),materials,
  });
}

export function encodeSftEstimate(details:SftEstimateDetails):string{
  const result=SFT_ESTIMATE_PREFIX+JSON.stringify(detailSchema.parse(details));
  if(result.length>3000)throw new Error('Reduce estimate rows or specification text');
  return result;
}
export function parseSftEstimate(description:string):SftEstimateDetails|null{
  if(!description.startsWith(SFT_ESTIMATE_PREFIX))return null;
  try {
    if(description.length>3000)return null;
    const value=JSON.parse(description.slice(SFT_ESTIMATE_PREFIX.length));
    return detailSchema.parse(value);
  }catch{return null;}
}
