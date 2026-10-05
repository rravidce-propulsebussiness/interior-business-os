'use server';
import { serverServices } from '@business-os/auth/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@business-os/database';
export async function saveBrochurePlatform(
  action: string,
  id: string,
  value: Record<string, number | boolean> = {},
) {
  try {
    const s = await serverServices();
    await s.authorization.requirePlatformPermission(
      action === 'plan'
        ? 'platform.entitlements.manage'
        : 'platform.organizations.manage',
    );
    const r = await s.client.rpc('brochure_platform', {
      p_action: action,
      p_id: id,
      p_value: value as Json,
    });
    if (r.error) throw r.error;
    revalidatePath('/dashboard/brochures');
    return { message: 'Brochure configuration updated' };
  } catch {
    return {
      message: 'Configuration unavailable. Check permissions and limits.',
    };
  }
}
