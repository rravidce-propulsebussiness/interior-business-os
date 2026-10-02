import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import {
  executionCommandSchema,
  executionEntitySchema,
  executionFilterSchema,
  executionRecordSchema,
  executionResultsSchema,
} from '@business-os/core/execution';
import { DomainError, idSchema } from '@business-os/shared';
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
export function createExecutionRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  return {
    async search(entity: unknown, filter: unknown = {}, page = 1) {
      return executionResultsSchema.parse(
        checked(
          await client.rpc('execution_search', {
            p_organization_id: org,
            p_entity: executionEntitySchema.parse(entity),
            p_filter: executionFilterSchema.parse(filter),
            p_page: page,
          }),
        ),
      );
    },
    async detail(entity: unknown, id: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_detail', {
            p_organization_id: org,
            p_entity: executionEntitySchema.parse(entity),
            p_id: idSchema.parse(id),
          }),
        ),
      );
    },
    async contracts(projectId?: string, page = 1) {
      return executionResultsSchema.parse(
        checked(
          await client.rpc('execution_contracts', {
            p_organization_id: org,
            ...(projectId ? { p_project_id: idSchema.parse(projectId) } : {}),
            p_page: page,
          }),
        ),
      );
    },
    async scope(contractId: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_scope', {
            p_organization_id: org,
            p_contract_id: idSchema.parse(contractId),
          }),
        ),
      );
    },
    async comparison(rfqId: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_vendor_comparison', {
            p_organization_id: org,
            p_rfq_id: idSchema.parse(rfqId),
          }),
        ),
      );
    },
    async costs(projectId: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_cost_dashboard', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
          }),
        ),
      );
    },
    async demand(revisionId: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_estimate_demand', {
            p_organization_id: org,
            p_revision_id: idSchema.parse(revisionId),
          }),
        ),
      );
    },
    async receiving(poId: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_po_progress', {
            p_organization_id: org,
            p_po_id: idSchema.parse(poId),
          }),
        ),
      );
    },
    async document(entity: unknown, id: string, vendorId?: string) {
      return executionRecordSchema.parse(
        checked(
          await client.rpc('execution_document', {
            p_organization_id: org,
            p_entity: executionEntitySchema.parse(entity),
            p_id: idSchema.parse(id),
            ...(vendorId ? { p_vendor_id: idSchema.parse(vendorId) } : {}),
          }),
        ),
      );
    },
    async command(input: unknown) {
      const c = executionCommandSchema.parse(input);
      let id: string;
      let entity: string;
      switch (c.action) {
        case 'configure':
          id = checked(
            await client.rpc('execution_configure', {
              p_organization_id: org,
              p_entity: c.entity,
              p_input: c.input,
            }),
          );
          entity = c.entity;
          break;
        case 'cost_record':
          id = checked(
            await client.rpc('execution_cost_record', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'material_cost_revisions';
          break;
        case 'estimate':
          id = checked(
            await client.rpc('execution_estimate_command', {
              p_organization_id: org,
              p_action: c.operation,
              p_input: c.input,
            }),
          );
          entity = 'execution_estimate_revisions';
          break;
        case 'line_save':
          await checked(
            await client.rpc('execution_line_save', {
              p_organization_id: org,
              p_revision_id: c.revision_id,
              p_input: c.input,
            }),
          );
          id = c.revision_id;
          entity = 'execution_estimate_revisions';
          break;
        case 'recipe_apply':
          id = checked(
            await client.rpc('execution_recipe_apply', {
              p_organization_id: org,
              p_revision_id: c.revision_id,
              p_input: c.input,
            }),
          );
          entity = 'execution_estimate_revisions';
          break;
        case 'line_remove':
          id = checked(
            await client.rpc('execution_line_remove', {
              p_organization_id: org,
              p_revision_id: c.revision_id,
              p_line_id: c.line_id,
              p_version: c.version,
            }),
          );
          entity = 'execution_estimate_revisions';
          break;
        case 'requisition_create':
          id = checked(
            await client.rpc('execution_requisition_create', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'purchase_requisitions';
          break;
        case 'requisition_transition':
          id = checked(
            await client.rpc('execution_requisition_transition', {
              p_organization_id: org,
              p_id: c.id,
              p_version: c.version,
              p_action: c.operation,
              p_reason: c.reason,
            }),
          );
          entity = 'purchase_requisitions';
          break;
        case 'rfq_create':
          id = checked(
            await client.rpc('execution_rfq_create', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'rfqs';
          break;
        case 'rfq_transition':
          id = checked(
            await client.rpc('execution_rfq_transition', {
              p_organization_id: org,
              p_id: c.id,
              p_version: c.version,
              p_action: c.operation,
            }),
          );
          entity = 'rfqs';
          break;
        case 'quote_save':
          id = checked(
            await client.rpc('execution_vendor_quote_save', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'vendor_quotes';
          break;
        case 'quote_transition':
          id = checked(
            await client.rpc('execution_vendor_quote_transition', {
              p_organization_id: org,
              p_id: c.id,
              p_version: c.version,
              p_action: c.operation,
            }),
          );
          entity = 'vendor_quotes';
          break;
        case 'po_create':
          id = checked(
            await client.rpc('execution_po_create', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'purchase_orders';
          break;
        case 'po_transition':
          id = checked(
            await client.rpc('execution_po_transition', {
              p_organization_id: org,
              p_id: c.id,
              p_version: c.version,
              p_action: c.operation,
              p_reason: c.reason,
            }),
          );
          entity = 'purchase_orders';
          break;
        case 'receipt_record':
          id = checked(
            await client.rpc('execution_receipt_record', {
              p_organization_id: org,
              p_input: c.input,
            }),
          );
          entity = 'goods_receipts';
          break;
      }
      return { id, entity };
    },
  };
}
