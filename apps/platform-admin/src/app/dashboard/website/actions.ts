'use server';
import { serverServices } from '@business-os/auth/server';
import { websiteJson } from '@business-os/database/website';
import { revalidatePath } from 'next/cache';
export async function savePlatformWebsite(operation: string, input: unknown) {
  try {
    const s = await serverServices();
    await s.authorization.requirePlatformPermission(
      'platform.entitlements.manage',
    );
    const r = await s.client.rpc('website_platform_update', {
      p_operation: operation,
      p_input: websiteJson(input),
    });
    if (r.error) throw r.error;
    revalidatePath('/dashboard/website');
    return { message: 'Platform website configuration updated.' };
  } catch {
    return {
      message:
        'Configuration could not be updated. Check values and permissions.',
    };
  }
}
