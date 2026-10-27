'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';

export type ResetPreview = {
  company: string;
  total: number;
  counts: Record<string, number>;
  signature: string;
  required_phrase: string;
};

/**
 * Fetch the expensive 123-table reset preview only after the owner clicks
 * "Preview test data reset". Never run this in the Settings page render.
 */
export async function ownerResetTestDataPreview(): Promise<
  { success: true; preview: ResetPreview } | { success: false; message: string }
> {
  try {
    const context = await activeOrganization();
    if (!context) return { success: false, message: 'Select a company first.' };
    const { authorization, client } = await serverServices();
    const access = await authorization.requirePermission(
      context.organizationId,
      'organization.manage',
    );
    if (!access.roles.some((role) => role.name.toLowerCase() === 'owner'))
      return {
        success: false,
        message: 'Only the company Owner may preview a reset.',
      };
    const { data, error } = await client.rpc('owner_test_data_reset_preview', {
      p_org: context.organizationId,
    });
    if (error)
      return {
        success: false,
        message:
          'Unable to load reset preview. Your data has not been changed.',
      };
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return { success: false, message: 'Invalid reset preview response.' };
    const value = data as Record<string, unknown>;
    if (
      typeof value.company !== 'string' ||
      !value.company ||
      typeof value.total !== 'number' ||
      !Number.isSafeInteger(value.total) ||
      value.total < 0 ||
      typeof value.required_phrase !== 'string' ||
      typeof value.signature !== 'string' ||
      !/^[a-f0-9]{32}$/.test(value.signature) ||
      !value.counts ||
      typeof value.counts !== 'object' ||
      Array.isArray(value.counts)
    )
      return {
        success: false,
        message: 'Reset preview could not be validated.',
      };
    const counts = value.counts as Record<string, unknown>;
    if (
      Object.values(counts).some(
        (n) => typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0,
      )
    )
      return { success: false, message: 'Reset counts are invalid.' };
    return {
      success: true,
      preview: {
        company: value.company,
        total: value.total,
        signature: value.signature,
        required_phrase: value.required_phrase,
        counts: counts as Record<string, number>,
      },
    };
  } catch {
    return {
      success: false,
      message: 'Reset preview unavailable. No changes were made.',
    };
  }
}

export async function ownerResetTestData(input: {
  signature: string;
  phrase: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const context = await activeOrganization();
    if (!context) return { success: false, message: 'Select a company first.' };
    const { authorization, client } = await serverServices();
    const access = await authorization.requirePermission(
      context.organizationId,
      'organization.manage',
    );
    if (!access.roles.some((role) => role.name.toLowerCase() === 'owner'))
      return {
        success: false,
        message: 'Only the company Owner may reset its test data.',
      };
    if (
      !/^[0-9a-f]{32}$/.test(input.signature) ||
      input.phrase.length > 220 ||
      !input.phrase.startsWith('RESET ')
    )
      return { success: false, message: 'Invalid reset confirmation.' };
    const resetRpc = client.rpc as unknown as (
      name: 'owner_test_data_reset_execute',
      args: { p_org: string; p_phrase: string; p_signature: string },
    ) => Promise<{ data: unknown; error: { code?: string } | null }>;
    const { data, error } = await resetRpc('owner_test_data_reset_execute', {
      p_org: context.organizationId,
      p_phrase: input.phrase,
      p_signature: input.signature,
    });
    if (error)
      return {
        success: false,
        message:
          error.code === '40001'
            ? 'Company data changed. Refresh the preview and try again.'
            : error.code === '23503'
              ? 'Linked records blocked reset. No data was removed.'
              : error.code === '42501'
                ? 'Only the company Owner can reset test data.'
                : 'Reset could not complete. No partial deletion was committed.',
      };
    const result = data as { success?: boolean; deleted_rows?: number } | null;
    if (result?.success !== true)
      return {
        success: false,
        message: 'Reset did not complete.',
      };
    revalidatePath('/dashboard', 'layout');
    revalidatePath('/dashboard/settings');
    return {
      success: true,
      message:
        'Reset completed. ' +
        (result.deleted_rows ?? 0) +
        ' operational test records removed. Your company and settings were kept.',
    };
  } catch {
    return {
      success: false,
      message: 'Reset could not complete. Nothing was confirmed as deleted.',
    };
  }
}
