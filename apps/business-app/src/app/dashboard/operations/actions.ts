'use server';
import { revalidatePath } from 'next/cache';
import {
  siteCommandSchema,
  siteCommandPermission,
} from '@business-os/core/operations';
import { safeFailure } from '@business-os/shared';
import { operationsServices } from './service';
import { parseOperationCommand } from '@business-os/core/operations-command';
export async function operationCommand(
  value: unknown,
): Promise<{ message: string; id?: string; entity?: string }> {
  try {
    const command = parseOperationCommand(value),
      s = await operationsServices(command.definition.permission);
    const result = await s.operations.command(value);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Saved.', ...result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
export async function operationChoices(
  kind: string,
  project?: string,
  query = '',
  page = 1,
) {
  const s = await operationsServices('execution.view');
  return s.operations.options(kind, project, query, page);
}
export async function siteCommand(
  input: unknown,
): Promise<{ message: string; saved: boolean }> {
  try {
    const command = siteCommandSchema.parse(input),
      s = await operationsServices(siteCommandPermission(command));
    await s.operations.siteCommand(command);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Saved.', saved: true };
  } catch (error) {
    return { message: safeFailure(error).message, saved: false };
  }
}
