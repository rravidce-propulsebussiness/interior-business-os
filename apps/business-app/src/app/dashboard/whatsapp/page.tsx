import Link from 'next/link';
import { automationServices } from '../automations/service';
import { WhatsAppSetup } from './setup';
import { WhatsAppWorkspace } from './workspace';

export const dynamic = 'force-dynamic';

export default async function WhatsAppPage() {
  const services = await automationServices('automation.view', true);
  const { data, error } = await services.client
    .from('whatsapp_business_connections')
    .select(
      'id,waba_id,business_name,phone_number_id,display_phone_number,verified_name,status,last_connected_at',
    )
    .eq('organization_id', services.context.organizationId)
    .order('created_at', { ascending: false });

  const configured = Boolean(
    process.env.META_APP_ID &&
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID &&
    process.env.META_GRAPH_API_VERSION,
  );
  const connections = error ? [] : (data ?? []);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <Link className="underline" href="/dashboard">
        Dashboard
      </Link>
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-800">
          Channels
        </p>
        <h1 className="text-3xl font-semibold">WhatsApp Business</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Connect a company-owned WhatsApp Business account through Meta’s
          secure signup. Your team will manage the connection inside this
          workspace.
        </p>
      </header>

      <WhatsAppSetup
        configured={configured}
        appId={process.env.META_APP_ID ?? ''}
        configurationId={process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? ''}
        graphApiVersion={process.env.META_GRAPH_API_VERSION ?? ''}
        canManage={services.context.grants.some(
          (grant) => grant.permission === 'automation.manage',
        )}
        initialMessage={
          error ? 'WhatsApp connection status is temporarily unavailable.' : ''
        }
        connections={connections.map((connection) => ({
          id: connection.id,
          businessName: connection.business_name,
          wabaId: connection.waba_id,
          phoneNumberId: connection.phone_number_id,
          displayPhoneNumber: connection.display_phone_number,
          verifiedName: connection.verified_name,
          status: connection.status,
          lastConnectedAt: connection.last_connected_at,
        }))}
      />

      <WhatsAppWorkspace
        connections={connections.map((connection) => ({
          id: connection.id,
          name:
            connection.business_name ||
            connection.verified_name ||
            'WhatsApp Business',
          phone: connection.display_phone_number || connection.phone_number_id,
          status: connection.status,
        }))}
      />
    </main>
  );
}
