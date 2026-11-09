export type WhatsAppErrorHelp = {
  /** Short reason shown to staff. */
  reason: string;
  /** What to do next. */
  action: string;
  /** Where to fix it, when Meta has a page for it. */
  link?: { label: string; href: string };
  /** Payment problems block every business-started message. */
  payment?: boolean;
};

export function metaBillingUrl(wabaId?: string) {
  return wabaId && /^\d{5,32}$/.test(wabaId)
    ? `https://business.facebook.com/latest/billing_hub/accounts?asset_id=${wabaId}`
    : 'https://business.facebook.com/latest/billing_hub/accounts';
}

export function whatsappManagerUrl(wabaId?: string) {
  return wabaId && /^\d{5,32}$/.test(wabaId)
    ? `https://business.facebook.com/latest/whatsapp_manager/overview/?asset_id=${wabaId}`
    : 'https://business.facebook.com/latest/whatsapp_manager/overview/';
}

/**
 * Plain-language help for WhatsApp Cloud API delivery errors, so staff see
 * "add money in Meta" instead of a bare code like 131042.
 */
export function whatsappErrorHelp(
  code: string | number | null | undefined,
  wabaId?: string,
): WhatsAppErrorHelp | null {
  const value = String(code ?? '').trim();
  if (!value) return null;
  switch (value) {
    case '131042':
      return {
        reason: 'Meta could not charge for this message',
        action:
          'Add money or a valid payment method (card/UPI) for this WhatsApp account in Meta, then send again.',
        link: { label: 'Add money / payment in Meta', href: metaBillingUrl(wabaId) },
        payment: true,
      };
    case '131047':
      return {
        reason: 'More than 24 hours since the customer last messaged',
        action:
          'Free-form replies are only allowed within 24 hours. Send an approved template instead.',
      };
    case '131026':
      return {
        reason: 'Message could not be delivered to this number',
        action:
          'The number may not be on WhatsApp, may have blocked you, or uses an old WhatsApp version.',
      };
    case '131049':
      return {
        reason: 'Meta limited marketing messages to this customer',
        action:
          'Meta limits how many marketing messages one person receives. Try later or use a utility template.',
      };
    case '131048':
    case '131056':
      return {
        reason: 'Sending too fast',
        action: 'Wait a few minutes and send again.',
      };
    case '132000':
    case '132001':
    case '132005':
    case '132007':
    case '132012':
      return {
        reason: 'Template problem',
        action:
          'The template is missing, not approved, or its values do not match. Check Templates.',
      };
    case '131051':
      return {
        reason: 'Message type not supported',
        action: 'Send the content as a photo, video or document instead.',
      };
    case '368':
    case '131031':
      return {
        reason: 'WhatsApp account restricted or locked',
        action: 'Open WhatsApp Manager to see the restriction and appeal it.',
        link: { label: 'Open WhatsApp Manager', href: whatsappManagerUrl(wabaId) },
      };
    default:
      return {
        reason: `WhatsApp error ${value}`,
        action: 'Check WhatsApp Manager for details.',
        link: { label: 'Open WhatsApp Manager', href: whatsappManagerUrl(wabaId) },
      };
  }
}
