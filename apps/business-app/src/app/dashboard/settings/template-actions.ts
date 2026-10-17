'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { idSchema, safeFailure } from '@business-os/shared';

export async function selectInvoiceTemplate(_previous: {message: string}, data: FormData) {
  try {
    const ctx = await activeOrganization();
    if (!ctx) return {message:'Select a company first.'};
    const {authorization,client} = await serverServices();
    await authorization.requirePermission(ctx.organizationId,'billing.manage');
    const id = idSchema.parse(data.get('template'));
    await createGstTemplatesRepository(client).selectCompany(ctx.organizationId,id);
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/finance');
    return {message:'Invoice template updated for future invoices.'};
  } catch(error) {
    return {message: safeFailure(error).message};
  }
}
