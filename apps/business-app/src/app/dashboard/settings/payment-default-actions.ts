'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import {
  companyConstructionStages,
  type CompanyConstructionStage,
} from '@business-os/core/company-construction-defaults';

export type DefaultPaymentState = {
  saved: boolean;
  message: string;
  industryKey?: string;
  savedRowsByIndustry?: Record<string, CompanyConstructionStage[]>;
};
export async function saveConstructionPaymentDefaults(
  _previous: DefaultPaymentState,
  form: FormData,
): Promise<DefaultPaymentState> {
  const raw = form.get('rows');
  const rawIndustry = form.get('industryKey');
  // Failures carry the industry key too, so the editor can show the message.
  const fail = (message: string): DefaultPaymentState => ({
    ..._previous,
    saved: false,
    message,
    ...(typeof rawIndustry === 'string' ? { industryKey: rawIndustry } : {}),
  });
  if (
    typeof rawIndustry !== 'string' ||
    !/^[a-z][a-z0-9-]{0,59}$/.test(rawIndustry)
  )
    return fail('Choose a valid industry workflow.');
  const industryKey = rawIndustry;
  if (typeof raw !== 'string' || raw.length > 300000)
    return fail('Invalid workflow data.');
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail('Invalid workflow data.');
  }
  const validated = companyConstructionStages.safeParse(payload);
  if (!validated.success)
    return fail(
      validated.error.issues[0]?.message ?? 'Invalid workflow stages.',
    );
  try {
    const context = await activeOrganization();
    if (!context) return fail('Sign in to manage company defaults.');
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
    if (error) return fail('Unable to save workflow: ' + error.message);
    revalidatePath('/dashboard/settings');
    return {
      saved: true,
      message: 'Workflow stages, durations and work sequence saved.',
      industryKey,
      savedRowsByIndustry: {
        ..._previous.savedRowsByIndustry,
        [industryKey]: validated.data,
      },
    };
  } catch {
    return fail('Only authorized company managers can save workflow settings.');
  }
}
