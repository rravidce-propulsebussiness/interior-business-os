'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

const specificationSchema = z.object({
  title: z.string().trim().min(2).max(90),
  brand: z.string().trim().max(120),
  grade: z.string().trim().max(120),
  description: z.string().trim().max(600),
  allowancePerSqft: z.string().max(40),
  unit: z.enum(['none','sqft','bathroom','door','piece','kg','tonne','bag',
    'cubic_meter','running_ft','point','lumpsum','meter','bhk']),
  pricingTreatment: z.enum(['included','allowance','extra','excluded']),
  allowanceValue: z.string().regex(/^(|[0-9]{1,9}(\.[0-9]{1,2})?)$/),
}).strict();

const packageSchema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  industryKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{1,19}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600),
  pricingBasis: z.enum(['fixed','per_sqft','per_bhk','per_unit']),
  basePrice: z.string().regex(/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/)
    .refine(v => Number(v) > 0),
  currency: z.string().regex(/^[A-Z]{3}$/),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  specSections: z.array(specificationSchema).max(32),
}).strict().superRefine((pkg,ctx) => {
  if (pkg.industryKey === 'construction' && pkg.pricingBasis !== 'per_sqft') {
    ctx.addIssue({ code:'custom',path:['pricingBasis'],
      message:'Construction packages must use a per-square-foot rate.' });
  }
  if (pkg.industryKey === 'construction' && Number(pkg.basePrice)>1000000) {
    ctx.addIssue({ code:'custom',path:['basePrice'],
      message:'Construction rate exceeds the supported limit.' });
  }
  if ((pkg.id && !pkg.version) || (!pkg.id && pkg.version)) {
    ctx.addIssue({ code:'custom',path:['version'],
      message:'Package ID and version must be supplied together.' });
  }
});

type ActionResult = { ok: boolean; message: string; id?: string; installed?: number };

type Rpc = (name: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

function refreshPackages() {
  revalidatePath('/admin/control/quotations');
  revalidatePath('/dashboard/quotations/packages');
}

export async function saveMasterQuotationPackage(raw: unknown): Promise<ActionResult> {
  try {
    const input = packageSchema.parse(raw);
    const { client, authorization } = await serverServices();
    await authorization.requirePlatformPermission('platform.entitlements.manage');
    const rpc = client.rpc.bind(client) as unknown as Rpc;
    const { data, error } = await rpc('platform_master_quotation_save',{p_input:input});
    if (error) throw new Error(error.message);
    refreshPackages();
    return {ok:true,id:String(data),message:'Master package draft saved. Company copies and issued quotations were not changed.'};
  } catch (error) {
    return {ok:false,message:safeFailure(error).message};
  }
}

export async function setMasterQuotationPackageStatus(input: {
  id: string; version: number; status: 'published' | 'archived';
}): Promise<ActionResult> {
  try {
    const fields = z.object({
      id:z.uuid(),version:z.number().int().positive(),
      status:z.enum(['published','archived']),
    }).strict().parse(input);
    const { client, authorization } = await serverServices();
    await authorization.requirePlatformPermission('platform.entitlements.manage');
    const rpc = client.rpc.bind(client) as unknown as Rpc;
    const {data,error} = await rpc('platform_master_quotation_status',{
      p_id:fields.id,p_version:fields.version,p_status:fields.status
    });
    if (error) throw new Error(error.message);
    refreshPackages();
    const installed=Number(data)||0;
    return {ok:true,installed,message:fields.status==='published'
      ? 'Published. '+installed+' new company copies created; existing company edits remain unchanged.'
      : 'Master package archived for future distribution. Existing company copies remain available.'};
  } catch(error) {
    return {ok:false,message:safeFailure(error).message};
  }
}
