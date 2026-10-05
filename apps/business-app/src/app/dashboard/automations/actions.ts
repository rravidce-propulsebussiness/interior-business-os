'use server';
import { revalidatePath } from 'next/cache';
import { safeFailure } from '@business-os/shared';
import { automationServices } from './service';
export async function configureAutomation(
  _previous: { message: string },
  form: FormData,
) {
  try {
    const s = await automationServices('automation.manage');
    const section = String(form.get('section'));
    const version = Number(form.get('version'));
    if (section === 'settings')
      await s.automation.configure(
        section,
        {
          notification_daily_limit: Number(
            form.get('notification_daily_limit'),
          ),
          email_daily_limit: Number(form.get('email_daily_limit')),
          retention_days: Number(form.get('retention_days')),
          customer_email_enabled: form.get('customer_email_enabled') === 'on',
        },
        version,
      );
    else if (section === 'template')
      await s.automation.configure(
        section,
        {
          key: String(form.get('key')),
          subject: String(form.get('subject')),
          body: String(form.get('body')),
        },
        version,
      );
    else if (section === 'consent')
      await s.automation.configure(
        'consent',
        {
          customer_id: String(form.get('customer_id')),
          email_enabled: form.get('email_enabled') === 'on',
          evidence: String(form.get('evidence')),
        },
        version,
      );
    else throw new Error('Invalid section');
    revalidatePath('/dashboard/automations/settings');
    return { message: 'Configuration saved.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
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
