'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

export type TemplateEditorResult = { message: string; saved?: boolean };
const section = z
  .object({
    title: z.string().trim().min(2).max(90),
    brand: z.string().trim().max(120),
    grade: z.string().trim().max(120),
    description: z.string().trim().max(600),
    allowancePerSqft: z.string().trim().max(40),
    kind: z.enum(['plans', 'material', 'custom']).optional(),
    deliverables: z.array(z.string().trim().min(2).max(90)).max(20).optional(),
    extraFields: z
      .array(
        z
          .object({
            label: z.string().trim().min(2).max(70),
            value: z.string().trim().max(250),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();

export async function saveGlobalConstructionTemplate(
  _previous: TemplateEditorResult,
  data: FormData,
): Promise<TemplateEditorResult> {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const raw: unknown = JSON.parse(String(data.get('sections') ?? '[]'));
    const sections = z.array(section).max(18).parse(raw);
    if (JSON.stringify(sections).length > 12000)
      return {
        message: 'Reduce template category or field details (12 KB maximum).',
      };
    const { error } = await client.rpc(
      'platform_construction_package_field_template_save',
      {
        p_sections: sections,
      },
    );
    if (error)
      return { message: 'Could not save platform specification defaults.' };
    revalidatePath('/admin/control/quotations/templates');
    return {
      saved: true,
      message:
        'Platform defaults saved for new company packages. Existing company prices and packages are unchanged.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
