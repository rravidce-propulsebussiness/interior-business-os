'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices, activeOrganization } from '@business-os/auth/server';
import { createConstructionRatesRepository } from '@business-os/database/construction-rates';
import { idSchema, DomainError, safeFailure } from '@business-os/shared';

export type RateActionState = { message: string; saved?: boolean };

const schema = z.object({
  id: idSchema.optional(),
  version: z.number().int().positive().optional(),
  category: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(120),
  specification: z.string().trim().max(250),
  ratePerSqft: z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/),
  status: z.enum(['active','inactive']),
}).strict();

export async function saveConstructionRate(
  _old: RateActionState,
  form: FormData,
): Promise<RateActionState> {
  try {
    const context = await activeOrganization();
    if (!context) throw new DomainError('FORBIDDEN');
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(context.organizationId,'pricing.manage',{moduleKey:'pricing'});
    await authorization.requirePermission(context.organizationId,'pricing.view',{moduleKey:'pricing'});
    const id=String(form.get('id')??'');
    const validated=schema.parse({
      ...(id ? {id,version:Number(form.get('version'))}:{}),
      category:String(form.get('category')??''),
      name:String(form.get('name')??''),
      specification:String(form.get('specification')??''),
      ratePerSqft:String(form.get('ratePerSqft')??''),
      status:form.get('status')==='inactive'?'inactive':'active',
    });
    await createConstructionRatesRepository(client).save(context.organizationId,validated);
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations','layout');
    return {saved:true,message:'Material rate saved. Existing issued quotations remain unchanged.'};
  } catch(error) {
    return {message:safeFailure(error).message};
  }
}
