import { activeOrganization, pageServices } from '@business-os/auth/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BankPayeeForm } from './bank-payee-form';

export const dynamic = 'force-dynamic';
type Payee = { beneficiaryName: string; bankName: string; accountNumber: string; ifsc: string; upiId: string };
export default async function BankSettingsPage() {
  const context = await activeOrganization();
  if (!context) notFound();
  const { authorization, client } = await pageServices();
  await authorization.requirePermission(context.organizationId, 'billing.manage');
  const rpc = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: { message: string } | null }>;
  const response = await rpc('invoice_bank_payee_read', { p_org: context.organizationId });
  if (response.error) throw new Error('Unable to read bank settings');
  const initial = response.data && typeof response.data === 'object' ? response.data as Payee : null;
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <Link href="/dashboard/billing" className="text-sm text-slate-600">← Billing</Link>
    <h1 className="text-2xl font-bold">Company payment settings</h1>
    <BankPayeeForm initial={initial}/>
  </main>;
}
