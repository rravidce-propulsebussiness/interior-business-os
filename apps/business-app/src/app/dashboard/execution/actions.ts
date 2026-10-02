'use server';
import { revalidatePath } from 'next/cache';
import {
  executionCommandSchema,
  executionCommandPermission,
} from '@business-os/core/execution';
import { safeFailure } from '@business-os/shared';
import { executionServices } from './service';
export async function executionCommand(
  input: unknown,
): Promise<{ message: string; id?: string; entity?: string }> {
  try {
    const command = executionCommandSchema.parse(input);
    const s = await executionServices(executionCommandPermission(command));
    const result = await s.execution.command(command);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Execution record saved.', ...result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
