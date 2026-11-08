/**
 * WhatsApp Cloud Calling API GET /{phone-number-id}/call_permissions.
 *
 * Meta returns the permission grant under "permission", while per-action
 * limits are at the TOP LEVEL under "actions". A messaging opt-in does not
 * grant WhatsApp voice-call permission.
 */
export type MetaCallPermission = {
  permission?: {
    status?: string;
    expiration_time?: number;
  };
  actions?: Array<{
    action_name?: string;
    can_perform_action?: boolean;
  }>;
};

export function metaCallActionAllowed(
  data: MetaCallPermission | null | undefined,
  action: 'start_call' | 'send_call_permission_request',
) {
  return (
    data?.actions?.some(
      (entry) =>
        entry.action_name === action && entry.can_perform_action === true,
    ) ?? false
  );
}

export function customerGrantedCalling(
  data: MetaCallPermission | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const status = data?.permission?.status?.toLowerCase();
  if (status === 'permanent' || status === 'granted') return true;
  if (status !== 'temporary') return false;
  const expiration = data?.permission?.expiration_time;
  return typeof expiration !== 'number' || expiration > nowSeconds;
}

export function canStartWhatsAppCall(
  data: MetaCallPermission | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return (
    customerGrantedCalling(data, nowSeconds) &&
    metaCallActionAllowed(data, 'start_call')
  );
}
