'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { idSchema, safeFailure } from '@business-os/shared';
import { z } from 'zod';

export async function selectInvoiceTemplate(
  _previous: { message: string },
  data: FormData,
) {
  try {
    const ctx = await activeOrganization();
    if (!ctx) return { message: 'Select a company first.' };
    const { authorization, client } = await serverServices();
    await authorization.requirePermission(ctx.organizationId, 'billing.manage');
    const id = idSchema.parse(data.get('template'));
    const mode = z.enum(['preset', 'custom']).parse(data.get('mode'));
    const style =
      mode === 'custom'
        ? {
            layout: z
              .enum(['modern', 'classic', 'minimal'])
              .parse(data.get('layout')),
            accent: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .parse(data.get('accent')),
            subtitle: z
              .string()
              .max(120)
              .parse(data.get('subtitle') ?? ''),
            footer: z
              .string()
              .max(400)
              .parse(data.get('footer') ?? ''),
            showUnit: data.get('showUnit') === 'on',
            showDiscount: data.get('showDiscount') === 'on',
            blankRows: z.coerce
              .number()
              .int()
              .min(1)
              .max(10)
              .parse(data.get('blankRows')),
          }
        : undefined;
    await createGstTemplatesRepository(client).selectCompany(
      ctx.organizationId,
      id,
      style,
    );
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/finance');
    return { message: 'Invoice template updated for future invoices.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
