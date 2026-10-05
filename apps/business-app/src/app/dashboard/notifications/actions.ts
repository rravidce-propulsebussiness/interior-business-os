'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeFailure } from '@business-os/shared';
import { automationServices } from '../automations/service';
export async function markNotification(
  id: string,
  version: number,
  status: 'unread' | 'read' | 'archived',
) {
  try {
    const s = await automationServices('notification.view');
    await s.automation.mark(
      id,
      z.number().int().positive().parse(version),
      z.enum(['unread', 'read', 'archived']).parse(status),
    );
    revalidatePath('/dashboard', 'layout');
    return { message: 'Notification updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function savePreferences(configuration: unknown, version: number) {
  try {
    const s = await automationServices('notification.manage_preferences');
    const next = await s.automation.savePreferences(
      configuration,
      z.number().int().nonnegative().parse(version),
    );
    revalidatePath('/dashboard', 'layout');
    return { message: 'Preferences saved.', version: next };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
