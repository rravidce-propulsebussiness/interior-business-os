'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
import { createOwnerProvisioningDatabase } from '@business-os/database/server';
import { createPlatformCompaniesRepository } from '@business-os/database/platform-companies';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { idSchema, safeFailure } from '@business-os/shared';

type State = { message: string };
const companyInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(80),
  legalName: z.string().trim().max(200),
  ownerEmail: z.email().trim().toLowerCase().max(254),
  ownerName: z.string().trim().min(2).max(200),
  temporaryPassword: z
    .string()
    .min(16)
    .max(128)
    .refine(
      (x) =>
        /[a-z]/.test(x) &&
        /[A-Z]/.test(x) &&
        /[0-9]/.test(x) &&
        /[^a-zA-Z0-9]/.test(x),
      'Temporary password must be strong and at least 16 characters.',
    ),
  country: z.string().regex(/^[A-Z]{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(1).max(100),
  planId: z.union([z.uuid(), z.literal('')]),
  industries: z.array(z.string().min(1).max(64)).min(1).max(12),
  seller: z.boolean(),
  storeName: z.string().trim().max(150),
});

export type CreateCompanyState = {
  message: string;
  created?: boolean;
  organizationId?: string;
  ownerProvisioned?: boolean;
};
export async function createPlatformCompany(
  _state: CreateCompanyState,
  form: FormData,
): Promise<CreateCompanyState> {
  void _state;
  let newUserId: string | null = null;
  let admin: ReturnType<typeof createOwnerProvisioningDatabase> | null = null;
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const input = companyInput.parse({
      name: form.get('name'),
      slug: form.get('slug'),
      legalName: form.get('legalName') ?? '',
      ownerEmail: form.get('ownerEmail'),
      ownerName: form.get('ownerName'),
      temporaryPassword: form.get('temporaryPassword'),
      country: form.get('country'),
      currency: form.get('currency'),
      timezone: form.get('timezone'),
      planId: form.get('planId') ?? '',
      industries: form.getAll('industries'),
      seller: form.get('seller') === 'true',
      storeName: form.get('storeName') ?? '',
    });
    if (new Set(input.industries).size !== input.industries.length)
      return { message: 'Select each industry only once.' };

    const companies = createPlatformCompaniesRepository(client);
    const accountStatus = await companies.ownerEmailStatus(input.ownerEmail);
    if (accountStatus === 'unverified')
      return {
        message:
          'This owner email already exists but is not verified. Verify the existing account before creating a company.',
      };
    if (accountStatus === 'suspended')
      return {
        message:
          'This owner account is suspended. Contact the platform administrator before creating another company.',
      };
    if (accountStatus === 'missing') {
      // The elevated key is never read until platform permission checks pass.
      // Auth stores only the password hash; no temporary password is saved
      // in the company, an audit log, or a Server Action return payload.
      try {
        admin = createOwnerProvisioningDatabase();
      } catch {
        return {
          message:
            'Owner account provisioning is not configured. Set the Business App server-only SUPABASE_SECRET_KEY and try again.',
        };
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: input.ownerEmail,
        password: input.temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: input.ownerName },
      });
      if (error || !data.user)
        return {
          message:
            'Unable to create this owner account. It may already exist, or the Auth service may be unavailable. Check the owner email and retry.',
        };
      newUserId = data.user.id;
    }

    let result: { organizationId: string };
    try {
      result = await companies.create({
        name: input.name,
        slug: input.slug,
        ...(input.legalName ? { legalName: input.legalName } : {}),
        ownerEmail: input.ownerEmail,
        country: input.country,
        currency: input.currency,
        timezone: input.timezone,
        ...(input.planId ? { planId: input.planId } : {}),
        industries: input.industries,
        seller: input.seller,
        ...(input.storeName ? { storeName: input.storeName } : {}),
      });
    } catch (error) {
      // Best-effort cleanup of an identity created in this request only.
      // Never delete an existing account, or a newly created account if
      // another request has already attached it to any company.
      if (admin && newUserId) {
        const membership = await admin
          .from('organization_memberships')
          .select('id')
          .eq('user_id', newUserId)
          .limit(1);
        if (!membership.error && membership.data?.length === 0) {
          const profile = await admin
            .from('profiles')
            .delete()
            .eq('id', newUserId);
          if (!profile.error) await admin.auth.admin.deleteUser(newUserId);
        }
      }
      throw error;
    }

    revalidatePath('/admin/organizations');
    revalidatePath('/admin/control/marketplace');
    return {
      message: newUserId
        ? 'Organization and owner created. Copy the temporary password now and share it securely with the owner. They should change it immediately.'
        : 'Organization created for this existing verified owner. Their current password was not changed.',
      created: true,
      organizationId: result.organizationId,
      ownerProvisioned: Boolean(newUserId),
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function enablePlatformSeller(_state: State, form: FormData) {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const organizationId = idSchema.parse(form.get('organizationId'));
    const storeName = z
      .string()
      .trim()
      .min(2)
      .max(150)
      .parse(form.get('storeName'));
    await createPlatformCompaniesRepository(client).enableSeller(
      organizationId,
      storeName,
    );
    revalidatePath('/admin/organizations/' + organizationId);
    revalidatePath('/admin/organizations');
    revalidatePath('/admin/control/marketplace');
    return { message: 'Seller storefront created and approved.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function updateCompanySeller(_state: State, form: FormData) {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const organizationId = idSchema.parse(form.get('organizationId'));
    const sellerId = idSchema.parse(form.get('sellerId'));
    const action = z
      .enum(['approve', 'reject', 'suspend'])
      .parse(form.get('action'));
    const company =
      await createPlatformCompaniesRepository(client).profile(organizationId);
    if (company.seller?.id !== sellerId)
      return { message: 'Seller does not belong to this company.' };
    await createMarketplaceRepository(client).sellerDecide(sellerId, action);
    revalidatePath('/admin/organizations/' + organizationId);
    revalidatePath('/admin/organizations');
    revalidatePath('/admin/control/marketplace');
    return { message: 'Seller status updated.' };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}

export async function updateCompanyIndustry(_state: State, form: FormData) {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    const organizationId = idSchema.parse(form.get('organizationId'));
    const industryId = idSchema.parse(form.get('industryId'));
    const enabled =
      z.enum(['true', 'false']).parse(form.get('enabled')) === 'true';
    await createPlatformCompaniesRepository(client).setIndustry(
      organizationId,
      industryId,
      enabled,
    );
    revalidatePath('/admin/organizations/' + organizationId);
    revalidatePath('/admin/organizations');
    revalidatePath('/admin/control/marketplace');
    return {
      message: enabled
        ? 'Industry enabled for company.'
        : 'Industry removed from company.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
