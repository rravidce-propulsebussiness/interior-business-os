import { automationServices } from '../automations/service';
import { WhatsAppSetup } from './setup';
import { WhatsAppHub } from './hub';
import { WhatsAppTestSender } from './test-sender';
import { serverServices } from '@business-os/auth/server';

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
  let canUseMetaTestSender = false;
  try {
    const { authorization } = await serverServices();
    await authorization.requirePlatformRole('platform_super_admin');
    canUseMetaTestSender = true;
  } catch {
    // The developer test sender is platform-admin-only.
  }

  const settingsPanel = (
    <div className="space-y-5">
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
      {canUseMetaTestSender && (
        <WhatsAppTestSender
          configured={Boolean(
            process.env.WHATSAPP_TEST_PHONE_NUMBER_ID &&
            process.env.WHATSAPP_TEST_ACCESS_TOKEN &&
            process.env.WHATSAPP_TEST_RECIPIENTS &&
            process.env.META_GRAPH_API_VERSION,
          )}
        />
      )}
    </div>
  );

  return (
    <main id="main-content" tabIndex={-1} className="wa-page-main">
      <WhatsAppHub
        canManage={services.context.grants.some(
          (grant) => grant.permission === 'automation.manage',
        )}
        settingsPanel={settingsPanel}
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
