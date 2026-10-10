'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { serverServices } from '@business-os/auth/server';
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
  country: z.string().regex(/^[A-Z]{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(1).max(100),
  planId: z.union([z.uuid(), z.literal('')]),
  industries: z.array(z.string().min(1).max(64)).min(1).max(12),
  seller: z.boolean(),
  storeName: z.string().trim().max(150),
});

export async function createPlatformCompany(_state: State, form: FormData) {
  let organizationId: string;
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
      country: form.get('country'),
      currency: form.get('currency'),
      timezone: form.get('timezone'),
      planId: form.get('planId') ?? '',
      industries: form.getAll('industries'),
      seller: form.get('seller') === 'true',
      storeName: form.get('storeName') ?? '',
    });
    if (new Set(input.industries).size !== input.industries.length) {
      return { message: 'Select each industry only once.' };
    }
    const result = await createPlatformCompaniesRepository(client).create({
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
    organizationId = result.organizationId;
    revalidatePath('/admin/organizations');
    revalidatePath('/admin/control/marketplace');
  } catch (error) {
    return { message: safeFailure(error).message };
  }
  redirect('/admin/organizations/' + organizationId + '?created=1');
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

export async function updateCompanyRole(_state: State, form: FormData) {
  try {
    const { authorization, client } = await serverServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    await authorization.requirePlatformPermission('platform.roles.manage');
    const organizationId = idSchema.parse(form.get('organizationId'));
    const membershipId = idSchema.parse(form.get('membershipId'));
    const roleId = idSchema.parse(form.get('roleId'));
    const remove =
      z.enum(['true', 'false']).parse(form.get('remove')) === 'true';
    await createPlatformCompaniesRepository(client).setRole(
      organizationId,
      membershipId,
      roleId,
      remove,
    );
    revalidatePath('/admin/organizations/' + organizationId);
    return {
      message: remove ? 'Member role removed.' : 'Member role assigned.',
    };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
