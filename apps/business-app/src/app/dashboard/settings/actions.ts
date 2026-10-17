'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { safeFailure } from '@business-os/shared';
import { companyCategoryOptions } from './company-categories';

const inputSchema = z.object({
  tradeName: z.string().trim().max(200),
  businessType: z.string().trim().max(80),
  pan: z.string().trim().toUpperCase().refine(v=>v===''||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),'Invalid PAN'),
  cin: z.string().trim().toUpperCase().max(25),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(''),z.email().max(254)]),
  website: z.union([z.literal(''),z.url().max(255).refine(v=>v.startsWith('https://'))]),
  address: z.string().trim().max(1000),
  city: z.string().trim().max(100),
  state: z.string().trim().max(100),
  pin: z.string().trim().refine(v=>v===''||/^[0-9]{6}$/.test(v),'Enter a valid 6-digit PIN'),
  categories: z.array(z.enum(companyCategoryOptions)).max(8),
  bankHolder: z.string().trim().max(200),
  bankAccount: z.string().trim().refine(v=>v===''||/^[0-9]{6,34}$/.test(v),'Invalid account number'),
  bankIfsc: z.string().trim().toUpperCase().refine(v=>v===''||/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),'Invalid IFSC'),
  bankName: z.string().trim().max(120),
  bankBranch: z.string().trim().max(160),
});

export async function saveCompanySettings(form: FormData): Promise<void> {
  let result: 'saved' | 'invalid' | 'forbidden' | 'unavailable' = 'unavailable';
  try {
    const context = await activeOrganization();
    if (!context) {
      result = 'forbidden';
    } else {
      const { authorization, client } = await serverServices();
      await authorization.requirePermission(context.organizationId,'organization.manage');
      const input = inputSchema.safeParse({
        tradeName: form.get('tradeName') ?? '',
        businessType: form.get('businessType') ?? '',
        pan: form.get('pan') ?? '',
        cin: form.get('cin') ?? '',
        phone: form.get('phone') ?? '',
        email: form.get('email') ?? '',
        website: form.get('website') ?? '',
        address: form.get('address') ?? '',
        city: form.get('city') ?? '',
        state: form.get('state') ?? '',
        pin: form.get('pin') ?? '',
        categories: form.getAll('categories'),
        bankHolder: form.get('bankHolder') ?? '',
        bankAccount: form.get('bankAccount') ?? '',
        bankIfsc: form.get('bankIfsc') ?? '',
        bankName: form.get('bankName') ?? '',
        bankBranch: form.get('bankBranch') ?? '',
      });
      if (!input.success) {
        result = 'invalid';
      } else {
        const { error } = await client.rpc('organization_identity_settings_save',{
          p_org: context.organizationId, p_input: input.data,
        });
        if (error) result = error.code === '42501' ? 'forbidden' :
          error.code === '22023'||error.code === '23514' ? 'invalid' : 'unavailable';
        else {
          revalidatePath('/dashboard/settings');
          result = 'saved';
        }
      }
    }
  } catch (error) {
    const failure = safeFailure(error);
    result = failure.code === 'FORBIDDEN' ? 'forbidden' : 'unavailable';
  }
  redirect('/dashboard/settings?tab=company&status='+result);
}
