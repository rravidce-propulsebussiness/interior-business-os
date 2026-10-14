'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';

const row = z
  .object({
    title: z.string().trim().min(2).max(90),
    kind: z.enum(['plans', 'material', 'custom']),
    deliverables: z.array(z.string().trim().min(2).max(90)).max(16),
  })
  .strict();
const rows = z.array(row).min(1).max(18);

export async function updateConstructionSpecDefaults(
  _state: { message: string; saved?: boolean },
  form: FormData,
): Promise<{ message: string; saved?: boolean }> {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const input: unknown = JSON.parse(String(form.get('sections') ?? '[]'));
    const sections = rows.parse(input);
    const { error } = await client.rpc('construction_spec_template_save', {
      p_sections: sections,
    });
    if (error)
      throw new Error('Could not update global specification defaults');
    revalidatePath('/admin/control/quotations');
    revalidatePath('/dashboard/pricing/construction');
    revalidatePath('/dashboard/quotations/packages');
    return {
      saved: true,
      message:
        'Default categories updated. Existing company packages are unchanged.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
