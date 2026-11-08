/** Meta phone-number calling settings use status values such as NOT_SET,
 * DISABLED, and ENABLED. Display values can include spaces or underscores.
 */
export function normalizeWhatsAppCallingStatus(status: unknown) {
  return typeof status === 'string'
    ? status.trim().toUpperCase().replace(/[\s-]+/g, '_')
    : '';
}

export function isWhatsAppCallingEnabled(status: unknown) {
  return normalizeWhatsAppCallingStatus(status) === 'ENABLED';
}

export function canRequestWhatsAppCallingEnable(status: unknown) {
  return ['NOT_SET', 'NOT_CONFIGURED', 'DISABLED'].includes(
    normalizeWhatsAppCallingStatus(status),
  );
}


/** Enable privately first; exposing the customer call button is a separate
 * explicitly confirmed action after relay/webhook/agent readiness.
 */
export function metaCallingUpdatePayload(action: 'enable' | 'publish' | 'hide') {
  return {
    calling: {
      status: 'ENABLED',
      call_icon_visibility: action === 'publish' ? 'DEFAULT' : 'DISABLE_ALL',
    },
  };
}
