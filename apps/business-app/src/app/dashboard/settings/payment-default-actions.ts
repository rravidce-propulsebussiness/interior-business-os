'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { companyConstructionStages } from '@business-os/core/company-construction-defaults';

export type DefaultPaymentState = {
  saved: boolean;
  message: string;
  industryKey?: string;
  savedRows?: import('@business-os/core/company-construction-defaults').CompanyConstructionStage[];
};
export async function saveConstructionPaymentDefaults(
  _previous: DefaultPaymentState,
  form: FormData,
): Promise<DefaultPaymentState> {
  const raw = form.get('rows');
  const industryKey = form.get('industryKey');
  if (typeof raw !== 'string' || raw.length > 300000)
    return { saved: false, message: 'Invalid payment schedule.' };
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { saved: false, message: 'Invalid payment schedule.' };
  }
  const validated = companyConstructionStages.safeParse(payload);
  if (!validated.success)
    return {
      saved: false,
      message: validated.error.issues[0]?.message ?? 'Invalid milestones',
    };
  if (
    typeof industryKey !== 'string' ||
    !/^[a-z][a-z0-9-]{0,59}$/.test(industryKey)
  )
    return { saved: false, message: 'Choose a valid industry workflow.' };
  try {
    const context = await activeOrganization();
    if (!context)
      return { saved: false, message: 'Sign in to manage company defaults.' };
    const { client, authorization } = await serverServices();
    await authorization.requirePermission(
      context.organizationId,
      'organization.manage',
    );
    const { error } = await client.rpc(
      'organization_industry_workflow_save' as never,
      {
        p_org: context.organizationId,
        p_industry: industryKey,
        p_rows: validated.data,
      } as never,
    );
    if (error)
      return {
        saved: false,
        message: 'Unable to save company defaults: ' + error.message,
      };
    revalidatePath('/dashboard/settings');
    return {
      saved: true,
      message:
        'Industry stages, durations, payment markers and site guides saved.',
      industryKey,
      savedRows: validated.data,
    };
  } catch {
    return {
      saved: false,
      message: 'Only authorized company managers can save payment defaults.',
    };
  }
}
