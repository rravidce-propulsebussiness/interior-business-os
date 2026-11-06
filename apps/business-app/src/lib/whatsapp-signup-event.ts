export type SignupEvent =
  | { kind: 'finish'; wabaId: string; phoneNumberId: string }
  | { kind: 'missing-assets' }
  | { kind: 'cancel' }
  | { kind: 'error'; message: string };

const FINISH_EVENTS = new Set([
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

export function isMetaOrigin(origin: string) {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      protocol === 'https:' &&
      (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'))
    );
  } catch {
    return false;
  }
}

/** Reads Meta's Embedded Signup browser message. Other messages return null. */
export function parseSignupEvent(raw: unknown): SignupEvent | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { type, event, data } = parsed as {
    type?: unknown;
    event?: unknown;
    data?: {
      waba_id?: unknown;
      phone_number_id?: unknown;
      error_message?: unknown;
      error_id?: unknown;
    };
  };
  if (type !== 'WA_EMBEDDED_SIGNUP' || typeof event !== 'string') return null;

  // Meta can report a failed flow with an error on a CANCEL event.
  if (event === 'ERROR' || data?.error_message || data?.error_id) {
    const text =
      typeof data?.error_message === 'string'
        ? data.error_message.slice(0, 300)
        : 'Meta reported an error during WhatsApp setup.';
    const id =
      typeof data?.error_id === 'string' || typeof data?.error_id === 'number'
        ? ` (Meta error ${String(data.error_id).slice(0, 40)})`
        : '';
    return { kind: 'error', message: `${text}${id}` };
  }
  if (event === 'CANCEL') return { kind: 'cancel' };
  if (!FINISH_EVENTS.has(event)) return null;

  const wabaId = data?.waba_id;
  const phoneNumberId = data?.phone_number_id;
  return typeof wabaId === 'string' &&
    wabaId &&
    typeof phoneNumberId === 'string' &&
    phoneNumberId
    ? { kind: 'finish', wabaId, phoneNumberId }
    : { kind: 'missing-assets' };
}
