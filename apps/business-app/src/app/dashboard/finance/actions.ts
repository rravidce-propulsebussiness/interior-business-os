'use server';
import { revalidatePath } from 'next/cache';
import { financeCommandSchema } from '@business-os/core/finance';
import { safeFailure } from '@business-os/shared';
import { financeServices } from './service';
export async function financeCommand(
  input: unknown,
): Promise<{ message: string; id?: string; entity?: string }> {
  try {
    const command = financeCommandSchema.parse(input);
    const permission =
      command.action === 'create_contract'
        ? 'contract.create'
        : command.action === 'contract_status'
          ? 'contract.manage'
          : command.action === 'save_schedule' ||
              command.action === 'activate_schedule'
            ? 'payment_schedule.manage'
            : command.action === 'issue_request'
              ? 'payment_request.create'
              : command.action === 'void_request'
                ? 'payment_request.manage'
                : command.action === 'save_invoice'
                  ? 'invoice.create'
                  : command.action === 'issue_invoice'
                    ? 'invoice.issue'
                    : command.action === 'void_invoice'
                      ? 'invoice.manage'
                      : command.action === 'record_payment'
                        ? 'payment.record'
                        : command.action === 'allocate_payment'
                          ? 'payment.allocate'
                          : command.action === 'void_payment'
                            ? 'payment.void'
                            : command.action === 'change_order'
                              ? {
                                  save: 'change_order.create',
                                  issue: 'change_order.issue',
                                  approve: 'change_order.approve',
                                  reject: 'change_order.manage',
                                  cancel: 'change_order.manage',
                                }[command.input.action]
                              : 'billing.manage';
    const s = await financeServices(permission);
    const result = await s.finance.command(command);
    revalidatePath('/dashboard', 'layout');
    return { message: 'Commercial record saved.', ...result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
