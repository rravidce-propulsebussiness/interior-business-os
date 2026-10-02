import 'server-only';
import { parseOperationCommand } from '@business-os/core/operations-command';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';
import {
  operationVersionSchema,
  operationChoicesSchema,
  siteCommandSchema,
  operationsEntitySchema,
  operationsFilterSchema,
  operationsResultsSchema,
  operationsRowSchema,
} from '@business-os/core/operations';
import { DomainError, idSchema } from '@business-os/shared';
function checked<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}): T {
  if (result.error || result.data === null)
    throw new DomainError(
      result.error?.code === '42501' ? 'FORBIDDEN' : 'VALIDATION_FAILED',
    );
  return result.data;
}
export function createOperationsRepository(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const org = idSchema.parse(organizationId);
  return {
    async scope(projectId: string, page = 1) {
      return operationsResultsSchema.parse(
        checked(
          await client.rpc('operations_scope_status', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
            p_page: page,
          }),
        ),
      );
    },
    async timeline(projectId: string, page = 1) {
      return operationsResultsSchema.parse(
        checked(
          await client.rpc('operations_timeline', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
            p_page: page,
          }),
        ),
      );
    },
    async document(
      kind: string,
      id: string,
      filter: Record<string, string> = {},
    ) {
      return operationsRowSchema.parse(
        checked(
          await client.rpc('operations_document', {
            p_organization_id: org,
            p_kind: kind,
            p_id: idSchema.parse(id),
            p_filter: filter,
          }),
        ),
      );
    },
    async materials(projectId: string, areaId?: string, page = 1) {
      return operationsResultsSchema.parse(
        checked(
          await client.rpc('operations_materials', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
            ...(areaId ? { p_area_id: idSchema.parse(areaId) } : {}),
            p_page: page,
          }),
        ),
      );
    },
    async costs(projectId: string) {
      return operationsRowSchema.parse(
        checked(
          await client.rpc('operations_costs', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
          }),
        ),
      );
    },
    async closure(projectId: string) {
      return operationsRowSchema.parse(
        checked(
          await client.rpc('operations_closure', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
          }),
        ),
      );
    },
    async command(value: unknown) {
      const { definition, input } = parseOperationCommand(value);
      const args = {
        p_organization_id: org,
        p_operation: definition.operation,
        p_input: input,
      };
      let id: string;
      switch (definition.group) {
        case 'save':
          id = checked(
            await client.rpc('operations_save', {
              p_organization_id: org,
              p_entity: definition.operation,
              p_input: input,
            }),
          );
          break;
        case 'plan':
          id = checked(await client.rpc('operations_plan', args));
          break;
        case 'refresh':
          id = checked(
            await client.rpc('operations_plan_refresh', {
              p_organization_id: org,
              p_id: idSchema.parse(input.id),
              p_version: operationVersionSchema.parse(input.version),
            }),
          );
          break;
        case 'task':
          id = checked(await client.rpc('operations_task', args));
          break;
        case 'issue_request':
          id = checked(await client.rpc('operations_issue_request', args));
          break;
        case 'stock':
          id = checked(await client.rpc('operations_stock', args));
          break;
        case 'inspection':
          id = checked(await client.rpc('operations_inspection', args));
          break;
        case 'snag':
          id = checked(await client.rpc('operations_snag', args));
          break;
        case 'handover':
          id = checked(await client.rpc('operations_handover', args));
          break;
        case 'work_order':
          id = checked(await client.rpc('operations_work_order', args));
          break;
      }
      return { id, entity: definition.entity };
    },
    async options(kind: string, project?: string, query = '', page = 1) {
      return operationChoicesSchema.parse(
        checked(
          await client.rpc('operations_options', {
            p_organization_id: org,
            p_kind: kind,
            ...(project ? { p_project_id: idSchema.parse(project) } : {}),
            p_query: query,
            p_page: page,
          }),
        ),
      );
    },
    async siteCommand(input: unknown) {
      const command = siteCommandSchema.parse(input);
      if (command.kind === 'task') {
        const { kind, ...payload } = command;
        return checked(
          await client.rpc('operations_task', {
            p_organization_id: org,
            p_operation: kind,
            p_input: payload,
          }),
        );
      }
      if (command.kind === 'snag') {
        const { project_id, title, description, priority } = command;
        return checked(
          await client.rpc('operations_snag', {
            p_organization_id: org,
            p_operation: 'create',
            p_input: { project_id, title, description, priority },
          }),
        );
      }
      const {
        operation,
        project_id,
        source_location_id,
        lot_id,
        quantity,
        reason,
        idempotency_key,
      } = command;
      return checked(
        await client.rpc('operations_stock', {
          p_organization_id: org,
          p_operation: operation,
          p_input: {
            project_id,
            source_location_id,
            lot_id,
            quantity,
            reason,
            idempotency_key,
          },
        }),
      );
    },
    async search(entity: unknown, filter: unknown = {}, page = 1) {
      return operationsResultsSchema.parse(
        checked(
          await client.rpc('operations_search', {
            p_organization_id: org,
            p_entity: operationsEntitySchema.parse(entity),
            p_filter: operationsFilterSchema.parse(filter),
            p_page: page,
          }),
        ),
      );
    },
    async dashboard(projectId: string) {
      return operationsRowSchema.parse(
        checked(
          await client.rpc('operations_dashboard', {
            p_organization_id: org,
            p_project_id: idSchema.parse(projectId),
          }),
        ),
      );
    },
    async balances(projectId?: string, page = 1) {
      return operationsResultsSchema.parse(
        checked(
          await client.rpc('operations_balances', {
            p_organization_id: org,
            ...(projectId ? { p_project_id: idSchema.parse(projectId) } : {}),
            p_page: page,
          }),
        ),
      );
    },
  };
}
