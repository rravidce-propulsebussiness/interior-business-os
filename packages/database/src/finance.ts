import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './generated/database.types';
import {
  financeCommandSchema,
  financeEntitySchema,
  financeFilterSchema,
  financeResultsSchema,
  financeRecordSchema,
} from '@business-os/core/finance';
import {
  catalogLine,
  catalogLineInputSchema,
  catalogSchema,
} from '@business-os/quotation-engine';
import { DomainError, idSchema } from '@business-os/shared';
import { attestQuotation } from './quotation-attestation';
function checked<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}): T {
  if (result.error || result.data === null)
    throw new DomainError(
      result.error?.code === '42501'
        ? 'FORBIDDEN'
        : result.error?.code === '40001' || result.error?.code === '23505'
          ? 'CONFLICT'
          : 'VALIDATION_FAILED',
    );
  return result.data;
}
export function createFinanceRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  async function signed(
    operation: 'finance_pricing' | 'finance_change',
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new DomainError('UNAUTHENTICATED');
    const key = process.env.QUOTATION_SIGNING_KEY;
    if (!key) throw new DomainError('INTERNAL_ERROR');
    return attestQuotation(key, data.user.id, org, operation, payload);
  }
  return {
    async search(entity: unknown, filter: unknown = {}, page = 1) {
      return financeResultsSchema.parse(
        checked(
          await client.rpc('finance_search', {
            p_organization_id: org,
            p_entity: financeEntitySchema.parse(entity),
            p_filter: financeFilterSchema.parse(filter),
            p_page: page,
          }),
        ),
      );
    },
    async detail(entity: unknown, id: string) {
      return financeRecordSchema.parse(
        checked(
          await client.rpc('finance_detail', {
            p_organization_id: org,
            p_entity: financeEntitySchema.parse(entity),
            p_id: idSchema.parse(id),
          }),
        ),
      );
    },
    async document(entity: string, id: string) {
      return checked(
        await client.rpc('finance_document', {
          p_organization_id: org,
          p_entity: entity,
          p_id: idSchema.parse(id),
        }),
      );
    },
    async summary(contractId?: string, customerId?: string) {
      return checked(
        await client.rpc('finance_summary', {
          p_organization_id: org,
          ...(contractId ? { p_contract_id: idSchema.parse(contractId) } : {}),
          ...(customerId ? { p_customer_id: idSchema.parse(customerId) } : {}),
        }),
      );
    },
    async timeline(contractId: string, page = 1) {
      return checked(
        await client.rpc('finance_timeline', {
          p_organization_id: org,
          p_contract_id: idSchema.parse(contractId),
          p_page: page,
        }),
      );
    },
    async scope(contractId: string) {
      const value = checked(
        await client.rpc('finance_contract_scope', {
          p_organization_id: org,
          p_contract_id: idSchema.parse(contractId),
        }),
      );
      if (!Array.isArray(value)) throw new DomainError('INTERNAL_ERROR');
      return value.map((row) => financeRecordSchema.parse(row));
    },
    async configuration(contractId: string, itemId: string) {
      return catalogSchema.parse(
        checked(
          await client.rpc('change_order_configuration', {
            p_organization_id: org,
            p_contract_id: idSchema.parse(contractId),
            p_item_id: idSchema.parse(itemId),
          }),
        ),
      );
    },
    async command(input: unknown): Promise<{ id: string; entity: string }> {
      const c = financeCommandSchema.parse(input);
      const result = (id: string, entity: string) => ({ id, entity });
      switch (c.action) {
        case 'create_contract':
          return result(
            checked(
              await client.rpc('contract_create', {
                p_organization_id: org,
                p_revision_id: c.revision_id,
              }),
            ),
            'contracts',
          );
        case 'contract_status':
          return result(
            checked(
              await client.rpc('contract_transition', {
                p_organization_id: org,
                p_id: c.id,
                p_version: c.version,
                p_status: c.status,
                p_reason: c.reason,
              }),
            ),
            'contracts',
          );
        case 'save_schedule':
          return result(
            checked(
              await client.rpc('payment_schedule_save', {
                p_organization_id: org,
                p_contract_id: c.contract_id,
                p_input: c.input,
              }),
            ),
            'payment_schedules',
          );
        case 'activate_schedule':
          return result(
            checked(
              await client.rpc('payment_schedule_activate', {
                p_organization_id: org,
                p_id: c.id,
                p_version: c.version,
              }),
            ),
            'payment_schedules',
          );
        case 'issue_request':
          return result(
            checked(
              await client.rpc('payment_request_issue', {
                p_organization_id: org,
                p_item_id: c.item_id,
                ...(c.due_date ? { p_due_date: c.due_date } : {}),
                p_note: c.note,
              }),
            ),
            'payment_requests',
          );
        case 'save_invoice':
          return result(
            checked(
              await client.rpc('invoice_save', {
                p_organization_id: org,
                p_contract_id: c.contract_id,
                p_input: c.input,
              }),
            ),
            'invoices',
          );
        case 'issue_invoice':
          return result(
            checked(
              await client.rpc('invoice_issue', {
                p_organization_id: org,
                p_id: c.id,
                p_version: c.version,
              }),
            ),
            'invoices',
          );
        case 'void_invoice':
          return result(
            checked(
              await client.rpc('invoice_void', {
                p_organization_id: org,
                p_id: c.id,
                p_reason: c.reason,
              }),
            ),
            'invoices',
          );
        case 'record_payment':
          return result(
            checked(
              await client.rpc('payment_record', {
                p_organization_id: org,
                p_contract_id: c.contract_id,
                p_input: c.input,
              }),
            ),
            'payments',
          );
        case 'allocate_payment':
          return result(
            checked(
              await client.rpc('payment_allocate', {
                p_organization_id: org,
                p_payment_id: c.id,
                p_input: c.input,
              }),
            ),
            'payments',
          );
        case 'void_payment':
          return result(
            checked(
              await client.rpc('payment_void', {
                p_organization_id: org,
                p_id: c.id,
                p_reason: c.reason,
              }),
            ),
            'payments',
          );
        case 'void_request':
          return result(
            checked(
              await client.rpc('payment_request_void', {
                p_organization_id: org,
                p_id: c.id,
                p_reason: c.reason,
              }),
            ),
            'payment_requests',
          );
        case 'settings':
        case 'payment_method':
        case 'tax_code': {
          const entity =
            c.action === 'settings'
              ? 'organization_billing_settings'
              : c.action === 'payment_method'
                ? 'payment_methods'
                : 'tax_codes';
          return result(
            checked(
              await client.rpc('finance_configure', {
                p_organization_id: org,
                p_entity: entity,
                p_input: c.input,
              }),
            ),
            entity,
          );
        }
        case 'change_order': {
          const items: Record<string, unknown>[] = [];
          for (const line of c.input.items ?? []) {
            if (
              line.pricing_type !== 'catalog' ||
              !['addition', 'modification'].includes(line.change_type)
            ) {
              items.push(line);
              continue;
            }
            const value = catalogLineInputSchema.parse(line.pricing);
            const raw = financeRecordSchema.parse(
              checked(
                await client.rpc(
                  'change_order_pricing_context',
                  await signed('finance_pricing', {
                    contract_id: c.input.contract_id,
                    item_id: value.pricing.item_id,
                  }),
                ),
              ),
            );
            if (
              typeof raw.currency !== 'string' ||
              typeof raw.fingerprint !== 'string' ||
              (raw.branch_id !== null && typeof raw.branch_id !== 'string')
            )
              throw new DomainError('INTERNAL_ERROR');
            value.pricing = {
              ...value.pricing,
              organization_id: org,
              currency: raw.currency,
              branch_id: raw.branch_id,
              at: new Date().toISOString(),
            };
            value.override = null;
            value.discount = { kind: 'none', value: '0' };
            value.optional = false;
            const { snapshot } = catalogLine(
              catalogSchema.parse(raw.catalog),
              value,
            );
            items.push({
              ...line,
              pricing: undefined,
              snapshot,
              fingerprint: raw.fingerprint,
            });
          }
          const payload = { ...c.input, ...(c.input.items ? { items } : {}) };
          return result(
            checked(
              await client.rpc(
                'change_order_command',
                await signed('finance_change', payload),
              ),
            ),
            'change_orders',
          );
        }
      }
    },
  };
}
export type FinanceJson = Json;
