'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { DomainError } from '@business-os/shared';

const id = z.uuid();
const name = z.string().trim().min(2).max(150);
const productSchema = z
  .object({
    id: z.union([z.uuid(), z.literal('')]).optional(),
    industryId: z.uuid(),
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(100),
    unit: z.string().trim().min(1).max(30),
    price: z.coerce.number().positive().max(100000000000),
    minQuantity: z.coerce.number().positive().max(1000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['draft', 'published', 'archived']),
  })
  .refine(
    (value) =>
      Math.round(value.price * 100) === value.price * 100 &&
      Math.round(value.minQuantity * 1000) === value.minQuantity * 1000,
  );
const orderSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.coerce.number().positive().max(1000000),
    requestKey: z.uuid(),
  })
  .refine(
    (value) => Math.round(value.quantity * 1000) === value.quantity * 1000,
  );

async function currentOrg() {
  const context = await activeOrganization();
  if (!context) throw new DomainError('FORBIDDEN');
  return context.organizationId;
}
function handleFailure(error: unknown, path: string): never {
  // Do not expose SQL details or arbitrary database text to users.
  const code = error instanceof DomainError ? error.code : 'VALIDATION_FAILED';
  redirect(path + '?error=' + encodeURIComponent(code));
}

export async function applyAsSeller(form: FormData) {
  const path = '/dashboard/marketplace/seller';
  try {
    const org = await currentOrg();
    const store = name.parse(form.get('storeName'));
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(org, 'organization.manage');
    await createMarketplaceRepository(client).sellerApply(org, store);
    revalidatePath(path);
  } catch (error) {
    handleFailure(error, path);
  }
  redirect(path + '?updated=application');
}

export async function saveMarketplaceProduct(form: FormData) {
  const path = '/dashboard/marketplace/seller';
  try {
    const org = await currentOrg();
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(org, 'catalog.manage');
    const raw = Object.fromEntries(form.entries());
    const parsed = productSchema.parse(raw);
    await createMarketplaceRepository(client).saveProduct(org, {
      ...parsed,
      ...(parsed.id ? { id: parsed.id } : {}),
    });
    revalidatePath(path);
  } catch (error) {
    handleFailure(error, path);
  }
  redirect(path + '?updated=product');
}

export async function placeMarketplaceOrder(form: FormData) {
  const path = '/dashboard/marketplace';
  try {
    const org = await currentOrg();
    const input = orderSchema.parse(Object.fromEntries(form.entries()));
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(org, 'purchase.manage');
    await createMarketplaceRepository(client).placeOrder(
      org,
      input.productId,
      input.quantity,
      input.requestKey,
    );
    revalidatePath('/dashboard/marketplace/orders');
  } catch (error) {
    handleFailure(error, path);
  }
  redirect('/dashboard/marketplace/orders?updated=request');
}

export async function decideMarketplaceOrder(form: FormData) {
  const path = '/dashboard/marketplace/seller';
  try {
    const org = await currentOrg();
    const { authorization, client } = await pageServices();
    await authorization.requirePermission(org, 'catalog.manage');
    await createMarketplaceRepository(client).orderDecide(
      org,
      id.parse(form.get('orderId')),
      z.enum(['accept', 'reject']).parse(form.get('action')),
    );
    revalidatePath(path);
  } catch (error) {
    handleFailure(error, path);
  }
  redirect(path + '?updated=order');
}

export async function decideMarketplaceSeller(form: FormData) {
  const path = '/admin/control/marketplace';
  try {
    const { authorization, client } = await pageServices();
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
    await createMarketplaceRepository(client).sellerDecide(
      id.parse(form.get('sellerId')),
      z.enum(['approve', 'reject', 'suspend']).parse(form.get('action')),
    );
    revalidatePath(path);
  } catch (error) {
    handleFailure(error, path);
  }
  redirect(path + '?updated=seller');
}
