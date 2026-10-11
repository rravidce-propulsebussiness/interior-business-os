'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { idSchema, safeFailure } from '@business-os/shared';

export type TemplateActionState = {
  message: string;
  saved?: boolean;
};

const configSchema = z
  .object({
    layout: z.enum(['modern', 'classic', 'minimal']),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    subtitle: z.string().trim().max(120),
    footer: z.string().trim().max(400),
    showUnit: z.boolean(),
    showDiscount: z.boolean(),
    blankRows: z.number().int().min(1).max(10),
    customFields: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(50),
          value: z.string().trim().max(120),
        }).strict(),
      )
      .max(5),
  })
  .strict();

export async function saveInvoiceTemplate(
  _previous: TemplateActionState,
  form: FormData,
): Promise<TemplateActionState> {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission('platform.entitlements.manage');
    const id = String(form.get('id') ?? '').trim();
    const config = configSchema.parse({
      layout: form.get('layout'),
      accent: form.get('accent'),
      subtitle: form.get('subtitle') ?? '',
      footer: form.get('footer') ?? '',
      showUnit: form.get('showUnit') === 'true',
      showDiscount: form.get('showDiscount') === 'true',
      blankRows: Number(form.get('blankRows')),
      customFields: JSON.parse(String(form.get('customFieldsJson') ?? '[]')) as unknown,
    });
    const input = {
      ...(id ? { id: idSchema.parse(id) } : {}),
      name: z.string().trim().min(3).max(90).parse(form.get('name')),
      kind: z.enum(['sales_invoice', 'purchase_bill']).parse(form.get('kind')),
      config,
    };
    await createGstTemplatesRepository(client).save(input);
    revalidatePath('/admin/control/billing');
    return { saved: true, message: 'Invoice layout saved. Existing documents are unchanged.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function setInvoiceTemplateStatus(
  _previous: TemplateActionState,
  form: FormData,
): Promise<TemplateActionState> {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission('platform.entitlements.manage');
    const id = idSchema.parse(form.get('id'));
    const active = form.get('active') === 'true';
    await createGstTemplatesRepository(client).setStatus(id, active);
    revalidatePath('/admin/control/billing');
    return { saved: true, message: active ? 'Template activated.' : 'Template archived for new documents.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
