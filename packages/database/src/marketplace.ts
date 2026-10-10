import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError } from '@business-os/shared';
import type { Database } from './generated/database.types';

export type MarketplaceIndustry = { id: string; key: string; name: string };
export type MarketplaceProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  minQuantity: number;
  currency: string;
  industryId: string;
  industry: string;
  seller: string;
  sellerOrganizationId: string;
};
export type SellerProduct = Omit<
  MarketplaceProduct,
  'industry' | 'seller' | 'sellerOrganizationId'
> & {
  status: 'draft' | 'published' | 'archived';
};
export type MarketplaceSeller = {
  id: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  products: SellerProduct[];
};
export type MarketplaceReviewSeller = {
  id: string;
  organizationId: string;
  name: string;
  company: string;
  status: MarketplaceSeller['status'];
  createdAt: string;
};
export type MarketplaceOrder = {
  id: string;
  productName: string;
  sellerName: string;
  buyerName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: 'requested' | 'accepted' | 'rejected';
  createdAt: string;
};

// Database functions are additive to the migration catalog; the generated
// client types are refreshed in the same PR. Keep all queries as user-scoped
// PostgREST RPCs. Never substitute a service-role key for authorization.
export function createMarketplaceRepository(client: SupabaseClient<Database>) {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
  async function invoke<T>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const result = await rpc(name, args);
    if (result.error) {
      const code = result.error.code;
      throw new DomainError(
        code === '42501'
          ? 'FORBIDDEN'
          : code === '23505'
            ? 'CONFLICT'
            : ['22023', '22P02', '23514', '23503'].includes(code ?? '')
              ? 'VALIDATION_FAILED'
              : 'INTERNAL_ERROR',
      );
    }
    return result.data as T;
  }
  return {
    industryCreate: (key: string, name: string) =>
      invoke<string>('marketplace_industry_create', {
        p_key: key,
        p_name: name,
      }),
    sellerIndustryAssign: (organizationId: string, industryId: string) =>
      invoke<void>('marketplace_seller_industry_assign', {
        p_organization_id: organizationId,
        p_industry_id: industryId,
      }),
    sellerApply: (organizationId: string, name: string) =>
      invoke<string>('marketplace_seller_apply', {
        p_organization_id: organizationId,
        p_name: name,
      }),
    sellerProfile: (organizationId: string) =>
      invoke<MarketplaceSeller | null>('marketplace_seller_profile', {
        p_organization_id: organizationId,
      }),
    sellerReview: (status: string = 'pending') =>
      invoke<MarketplaceReviewSeller[]>('marketplace_sellers_review', {
        p_status: status,
      }),
    sellerDecide: (
      sellerId: string,
      action: 'approve' | 'reject' | 'suspend',
    ) =>
      invoke<void>('marketplace_seller_decide', {
        p_seller_id: sellerId,
        p_action: action,
      }),
    saveProduct: (
      organizationId: string,
      product: {
        id?: string;
        industryId: string;
        sku: string;
        name: string;
        category: string;
        unit: string;
        price: number;
        minQuantity: number;
        currency: string;
        status: 'draft' | 'published' | 'archived';
      },
    ) =>
      invoke<string>('marketplace_product_save', {
        p_organization_id: organizationId,
        p_input: product,
      }),
    catalog: (organizationId: string, industryId?: string, query?: string) =>
      invoke<MarketplaceProduct[]>('marketplace_catalog', {
        p_organization_id: organizationId,
        p_industry_id: industryId ?? null,
        p_query: query ?? null,
      }),
    placeOrder: (
      organizationId: string,
      productId: string,
      quantity: number,
      idempotencyKey: string,
    ) =>
      invoke<string>('marketplace_order_place', {
        p_organization_id: organizationId,
        p_product_id: productId,
        p_quantity: quantity,
        p_idempotency_key: idempotencyKey,
      }),
    orders: (organizationId: string, role: 'buyer' | 'seller') =>
      invoke<MarketplaceOrder[]>('marketplace_orders', {
        p_organization_id: organizationId,
        p_role: role,
      }),
    orderDecide: (
      organizationId: string,
      orderId: string,
      action: 'accept' | 'reject',
    ) =>
      invoke<void>('marketplace_order_decide', {
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_action: action,
      }),
  };
}
