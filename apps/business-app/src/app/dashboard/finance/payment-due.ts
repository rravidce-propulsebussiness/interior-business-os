import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@business-os/database/generated/database.types';

export type MilestoneDue = { amount: string; label: string; source: 'milestone' };

/**
 * The next *unpaid* contractual milestone, not the total contract value.
 * Payments are allocated sequentially to agreed milestones for the
 * full-amount default. No receipt, invoice or payment is created here.
 */
export async function nextMilestoneDue(
  client: SupabaseClient<Database>, org: string, contractId: string,
): Promise<MilestoneDue | null> {
  const { data: active, error: scheduleError } = await client.from('payment_schedules')
    .select('id').eq('organization_id',org).eq('contract_id',contractId)
    .eq('status','active').limit(1).maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!active?.id) return null;

  const [itemResult, paymentResult] = await Promise.all([
    client.from('payment_schedule_items').select('label,expected_amount,sort_order')
      .eq('organization_id',org).eq('contract_id',contractId)
      .eq('schedule_id',active.id).order('sort_order').limit(200),
    client.from('payments').select('amount')
      .eq('organization_id',org).eq('contract_id',contractId)
      .eq('status','recorded').limit(1001),
  ]);
  if (itemResult.error || paymentResult.error || !itemResult.data || !paymentResult.data)
    throw new Error('Could not verify payment milestone');
  // Never derive a falsely small outstanding balance from a truncated ledger.
  if (paymentResult.data.length>=1001) throw new Error('Payment ledger requires reconciliation');
  let receivedCents=paymentResult.data.reduce(
    (sum,row)=>sum+Math.round(Number(row.amount)*100),0);
  if (!Number.isSafeInteger(receivedCents) || receivedCents<0)
    throw new Error('Invalid received payment balance');
  for (const row of itemResult.data) {
    const expected=Math.round(Number(row.expected_amount)*100);
    if (!Number.isSafeInteger(expected) || expected<0)
      throw new Error('Invalid scheduled milestone amount');
    if (receivedCents>=expected) {receivedCents-=expected;continue;}
    const outstanding=expected-receivedCents;
    if (outstanding>0) return {
      amount:(outstanding/100).toFixed(2),label:row.label,source:'milestone',
    };
    receivedCents=0;
  }
  return null;
}
