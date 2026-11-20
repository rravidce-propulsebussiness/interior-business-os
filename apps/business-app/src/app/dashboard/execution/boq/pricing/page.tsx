import { executionServices } from '../../service';
import type { SupabaseClient } from '@business-os/database';
import { BoqRateCard } from '../../boq-rate-card';

export const dynamic = 'force-dynamic';

export default async function BoqPricingPage() {
  const s = await executionServices('estimate.view_cost', true);
  const db = s.client as unknown as SupabaseClient;
  const result = await db
    .from('construction_boq_rate_cards')
    .select('rates')
    .eq('organization_id', s.org)
    .maybeSingle();
  if (result.error) throw new Error('BOQ rates are temporarily unavailable.');
  return (
    <BoqRateCard
      saved={result.data?.rates?.items || []}
      savedStructural={result.data?.rates?.structural ?? null}
      canEdit={s.allowed('estimate.edit')}
    />
  );
}
