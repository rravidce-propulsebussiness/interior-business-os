import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { commercialServices } from '../../../commercial/service';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';
import { quotationCommandSchema } from '@business-os/core/commercial';
import { savedStagePaymentPlan, encodeStagePaymentLinks, savedStagePaymentLinks } from '@business-os/core/quotation-payment-plan';
import { constructionPlanFromQuotedDescriptions } from '@business-os/core/quote-construction-handoff';
import { encodeStageRequirements,savedStageRequirements,validateStageRequirements } from '@business-os/core/quotation-stage-requirements';
import {validateMilestoneFlow,encodeMilestoneFlow,savedMilestoneFlow}
 from '@business-os/core/quotation-milestone-flow';
import { joinQuotationTerms, splitQuotationTerms } from '../../quotation-terms-format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const text = z.string().max(7000);
const discount = z.object({
  kind: z.enum(['none','fixed','percentage']),
  value: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/),
}).strict();
const payload = z.discriminatedUnion('kind',[
  z.object({
    kind: z.literal('terms'),
    validUntil: z.iso.date(),
    inclusions: text, exclusions: text, warranty: text,
    additional: text, customerNotes: z.string().max(10000),
    internalNotes: z.string().max(10000),
    discount,
  }).strict(),
  z.object({
    kind: z.literal('payments'),
    stages: z.array(z.object({
      name: z.string().trim().min(2).max(100),
      percent: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      stageCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]*)?$/).max(120)).max(18).optional(),
    }).strict()).min(1).max(40),
    stageRequirements:z.record(z.string(),z.unknown()).optional(),
    milestoneFlow:z.record(z.string(),z.unknown()).optional(),
  }).strict(),
]);

const reply = (data: unknown, status: number) => Response.json(data, {
  status,headers:{
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  },
});

/**
 * Update quote conditions using a fresh database revision each time. Each
 * form owns only its section, preventing Terms from erasing saved payments
 * or Payment Schedule from reverting recently edited warranty/notes.
 * Actual edit authorization, tenant isolation and optimistic version checks
 * remain in the existing quotation repository.
 */
export async function POST(request:Request, {params}:{
  params:Promise<{id:string}>;
}) {
  const ref=crypto.randomUUID().slice(0,8);
  try {
    const origin=request.headers.get('origin');
    const allowedHosts=[
      new URL(request.url).host,
      request.headers.get('host'),
      request.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),
    ].filter(Boolean);
    if (origin) {
      const value=new URL(origin);
      if (!['https:','http:'].includes(value.protocol) ||
        !allowedHosts.includes(value.host))
        return reply({message:'Cross-site quotation update denied.',reference:ref},403);
    } else if (!['same-origin','none'].includes(request.headers.get('sec-fetch-site')??'')) {
      return reply({message:'Quotation update requires a same-origin request.',reference:ref},403);
    }
    if (Number(request.headers.get('content-length')??0)>45000)
      return reply({message:'Quotation conditions exceed the allowed size.',reference:ref},413);
    const {id}=await params;
    idSchema.parse(id);
    const body=await request.text();
    if(body.length>45000)return reply({message:'Quotation conditions exceed the allowed size.',reference:ref},413);
    const parsed=payload.safeParse(JSON.parse(body));
    if(!parsed.success){
      const issue=parsed.error.issues[0];
      return reply({message:'Please check '+(issue?.path.join('.')||'quotation details')+'.',
        reference:ref},422);
    }
    const incoming=parsed.data;
    const s=await commercialServices('quotation.edit','quotation');
    const {data:current,error}=await s.client
      .from('quotation_revisions')
      .select('id,version,status,terms,customer_notes,internal_notes,valid_until,discount')
      .eq('id',id).eq('organization_id',s.org).maybeSingle();
    if(error||!current)return reply({message:'Quotation not found or access denied.',reference:ref},404);
    if(current.status!=='draft')
      return reply({message:'This quotation is already shared. Create a revision to edit it.',reference:ref},409);

    const originalDiscount=discount.safeParse(current.discount);
    if(!originalDiscount.success)
      return reply({message:'Stored quotation discount needs attention.',reference:ref},422);
    const discountValue=incoming.kind==='terms' &&
      s.allowed('quotation.discount','quotation') ? incoming.discount : originalDiscount.data;

    let terms:string;
    if(incoming.kind==='payments'){
      const total=incoming.stages.reduce((sum,row)=>sum+Number(row.percent),0);
      if(!Number.isFinite(total)||Math.abs(total-100)>0.001||
        incoming.stages.some(row=>Number(row.percent)<=0||Number(row.percent)>100))
        return reply({message:'Stage percentages must total exactly 100%.',reference:ref},422);
      const saved=splitQuotationTerms(current.terms);
      if(incoming.stages.some(row=>row.stageCodes?.length)){
        const items=await s.client.from('quotation_items').select('description')
          .eq('organization_id',s.org).eq('revision_id',id).limit(250);
        if(items.error||!items.data)
          return reply({message:'Unable to verify quote floor scope.',reference:ref},422);
        let planned;
        try{
          planned=constructionPlanFromQuotedDescriptions(items.data.map(item=>item.description));
        }catch{
          return reply({message:'Save a valid unique floor-wise construction quote first.',reference:ref},422);
        }
        if(!planned)return reply({message:'Save the quoted floors before linking payments to construction stages.',reference:ref},422);
        const validKeys=new Set(planned.stages.map(stage=>stage.instanceCode));
        if(incoming.stages.some(row=>row.stageCodes?.some(key=>!validKeys.has(key))))
          return reply({message:'Payment milestone references a stage outside the quoted floor plan.',reference:ref},422);
      }
      const mark='[STAGE_PAYMENT_PLAN]\n'+incoming.stages
        .map(row=>row.name.replaceAll('|','-')+'|'+Number(row.percent).toFixed(2))
        .join('\n')+'\n[/STAGE_PAYMENT_PLAN]';
      const hasLinks=incoming.stages.some(row=>row.stageCodes?.length);
      const links=hasLinks?encodeStagePaymentLinks(incoming.stages.map(row=>row.stageCodes??[])):'';
      let overrides;
      try{overrides=validateStageRequirements(incoming.stageRequirements??savedStageRequirements(current.terms));}
      catch{ return reply({message:'Check the customized work, materials and QC lists.',reference:ref},422); }
      const validStageKeys=incoming.stages.flatMap(row=>row.stageCodes??[]);
      if(Object.keys(overrides).some(code=>!validStageKeys.includes(code)))
        return reply({message:'Customized requirements must belong to a quoted construction work stage.',reference:ref},422);
      // An execution Payment step may refer only to a real signed quotation
      // milestone that covers this construction stage. It is not a receipt.
      for(const [code,item] of Object.entries(overrides)){
        if(item.flow?.some(step=>step.kind==='payment'&&
          !incoming.stages[step.index]?.stageCodes?.includes(code)))
          return reply({message:'Choose a payment milestone linked to '+code+'.',reference:ref},422);
      }
      let sequence='';
      try{
       const plan=validateMilestoneFlow(incoming.milestoneFlow??savedMilestoneFlow(current.terms),
        overrides,incoming.stages);
       sequence=encodeMilestoneFlow(plan);
      }catch(error){
       return reply({message:error instanceof Error?error.message:
        'The milestone workflow contains a missing work stage or QC reference.',reference:ref},422);
      }
      const custom=encodeStageRequirements(overrides);
      terms=joinQuotationTerms({...saved,paymentPlan:
       [mark,links,custom,sequence].filter(Boolean).join('\n')});
      if(!savedStagePaymentPlan(terms)||
        (hasLinks&&!savedStagePaymentLinks(terms)))
        return reply({message:'Invalid payment schedule. Check all stages and percentages.',reference:ref},422);
    }else{
      const saved=splitQuotationTerms(current.terms);
      terms=joinQuotationTerms({
        inclusions:incoming.inclusions,
        exclusions:incoming.exclusions,
        warranty:incoming.warranty,
        additional:incoming.additional,
        paymentPlan:saved.paymentPlan,
      });
    }
    const command=quotationCommandSchema.parse({
      action:'edit_revision',
      revision_id:id,version:current.version,
      terms,
      customer_notes:incoming.kind==='terms'?incoming.customerNotes:current.customer_notes,
      internal_notes:incoming.kind==='terms'?incoming.internalNotes:current.internal_notes,
      valid_until:incoming.kind==='terms'?incoming.validUntil:current.valid_until,
      discount:discountValue,
    });
    const result=await s.commercial.commit(s.org,command);
    revalidatePath('/dashboard','layout');
    return reply({
      id:result,
      version:current.version+1,
      message:incoming.kind==='payments'
        ?'Payment schedule saved. The customer PDF uses these stages.'
        :'Terms & Inclusions saved. The customer PDF uses these conditions.',
    },200);
  } catch(error){
    const failure=safeFailure(error);
    console.error('quotation.conditions.failed',{
      reference:ref,
      code:error instanceof DomainError?error.code:'INTERNAL_ERROR',
    });
    return reply({
      message:failure.message,
      reference:ref,
    },error instanceof DomainError &&
      ['CONFLICT','VERSION_CONFLICT'].includes(error.code)?409:500);
  }
}
