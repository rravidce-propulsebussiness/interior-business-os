import { executionServices } from '../service';
import { InteriorCutlistWorkspace } from '../interior-cutlist-workspace';

export const dynamic = 'force-dynamic';

export default async function InteriorCutlistPage() {
  const s = await executionServices('estimate.view', true);
  return <InteriorCutlistWorkspace canCreate={s.allowed('estimate.create')} />;
}
