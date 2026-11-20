'use server';
import { revalidatePath } from 'next/cache';
import { safeFailure } from '@business-os/shared';
import { automationServices } from './service';
export async function saveRule(
  configuration: unknown,
  id?: string,
  version = 0,
) {
  try {
    const s = await automationServices('automation.manage');
    const result = await s.automation.save(configuration, id, version);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Rule saved.', ...result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function testRule(rule: string, event: string) {
  try {
    const s = await automationServices('automation.execute');
    return {
      message: 'Preview only. No actions were executed.',
      preview: await s.automation.test(rule, event),
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function retryJob(job: string) {
  try {
    const s = await automationServices('automation.retry');
    await s.automation.retry(job);
    revalidatePath('/dashboard', 'layout');
    return {
      message:
        'Retry queued. Current permissions and source state will be checked again.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
