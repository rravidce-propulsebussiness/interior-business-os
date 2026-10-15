'use server';
import { revalidatePath } from 'next/cache';
import { financeCommandSchema } from '@business-os/core/finance';
import { safeFailure } from '@business-os/shared';
import { financeServices } from './service';
import { syncQuotedConstructionTimeline } from './quote-construction-handoff';
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
    let message = 'Commercial record saved.';
    if (command.action === 'create_contract') {
      try {
        const sync = await syncQuotedConstructionTimeline(result.id);
        if (sync.reason === 'created' || sync.reason === 'exists') {
          message =
            'Agreement created. The quote-derived project stages and accepted scope are available in Projects; work still requires agreement and design approvals.';
        } else if (sync.reason === 'quote_incomplete') {
          message =
            'Agreement created. The approved quote has no usable industry-specific scope or BOQ; no stages were guessed.';
        } else {
          message =
            'Agreement created. An authorized owner or agreement creator can synchronize the timeline from the accepted quote without entering rooms or floors again.';
        }
        if (sync.projectId) {
          revalidatePath('/dashboard/projects/' + sync.projectId);
          revalidatePath('/dashboard/projects/' + sync.projectId + '/site');
        }
      } catch {
        // The canonical contract remains the source of truth even if setup
        // fails; never report that the agreement or timeline was rolled back.
        message =
          'Agreement created. Timeline setup needs attention in the project workspace; the accepted quote remains unchanged.';
      }
    }
    revalidatePath('/dashboard', 'layout');
    return { message, ...result };
  } catch (error) {
    return { message: safeFailure(error).message };
  }
}
