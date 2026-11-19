/**
 * Human-readable text for stored WhatsApp message bodies.
 *
 * Webhook ingest stores media as "[[WA_MEDIA:<id>:<kind>]]", structured
 * messages as "[[WA_JSON:<type>]]" followed by JSON, and payload-free types
 * as "[<type> message]". Raw markers must never be shown to staff as-is.
 */
const PLACEHOLDER = /^\[([a-z_]{1,40}) message\]$/;
const MEDIA =
  /^\[\[WA_MEDIA:[A-Za-z0-9._-]{1,200}:(image|video|audio|document|sticker)\]\](?:\r?\n([\s\S]*))?$/;
const RICH = /^\[\[WA_JSON:([a-z_]{1,40})\]\]\r?\n([\s\S]*)$/;

const TYPE_LABELS: Record<string, string> = {
  unsupported: 'Message type not supported by WhatsApp Business Platform',
  reaction: 'Reacted to a message',
  sticker: 'Sticker',
  location: 'Shared a location',
  contacts: 'Shared a contact card',
  interactive: 'Interactive reply',
  button: 'Button reply',
  order: 'Sent an order',
  system: 'WhatsApp account update',
  request_welcome: 'Opened the chat',
  ephemeral: 'Disappearing message',
  unknown: 'Message',
};

const MEDIA_LABELS: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice / audio',
  document: 'Document',
  sticker: 'Sticker',
};

export type WhatsAppRichMessage = {
  type: string;
  payload: Record<string, unknown>;
  content: Record<string, unknown>;
};

/** Parse the bounded JSON payload stored for non-text Cloud API messages. */
export function parseWhatsAppRichMessage(
  body: string,
): WhatsAppRichMessage | null {
  const match = RICH.exec(body.trim());
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[2] ?? '') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    const payload = parsed as Record<string, unknown>;
    const nested = payload[match[1]!];
    return {
      type: match[1]!,
      payload,
      content:
        nested && typeof nested === 'object' && !Array.isArray(nested)
          ? (nested as Record<string, unknown>)
          : payload,
    };
  } catch {
    return null;
  }
}

function richMessagePreview(message: WhatsAppRichMessage): string {
  const { type, content } = message;
  const text = (value: unknown) =>
    typeof value === 'string' ? value.trim() : '';
  if (type === 'reaction')
    return text(content.emoji)
      ? `Reaction: ${text(content.emoji)}`
      : 'Reaction';
  if (type === 'location') {
    return [text(content.name) || 'Shared a location', text(content.address)]
      .filter(Boolean)
      .join(' · ');
  }
  if (type === 'contacts') {
    const contacts = Array.isArray(content.contacts) ? content.contacts : [];
    const first = contacts[0] as Record<string, unknown> | undefined;
    const name = first?.name as Record<string, unknown> | undefined;
    return typeof name?.formatted_name === 'string'
      ? `Contact: ${name.formatted_name}`
      : contacts.length
        ? `Shared ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`
        : 'Shared a contact';
  }
  if (type === 'order') return 'Order received';
  if (type === 'interactive') {
    const reply =
      (content.button_reply as Record<string, unknown> | undefined) ??
      (content.list_reply as Record<string, unknown> | undefined) ??
      (content.nfm_reply as Record<string, unknown> | undefined);
    return text(reply?.title) || text(reply?.body) || 'Interactive reply';
  }
  if (type === 'button') return text(content.text) || 'Button reply';
  if (type === 'sticker') return 'Sticker';
  if (type === 'system') return text(content.body) || 'WhatsApp account update';
  if (type === 'request_welcome') return 'Opened the chat';
  if (type === 'ephemeral') return 'Disappearing message';
  return TYPE_LABELS[type] ?? `${type.replace(/_/g, ' ')} message`;
}

/** Placeholder label for a non-text, non-media message, or null for normal text. */
export function whatsappPlaceholderLabel(body: string): string | null {
  const match = PLACEHOLDER.exec(body.trim());
  if (!match) return null;
  const type = match[1]!;
  return TYPE_LABELS[type] ?? `${type.replace(/_/g, ' ')} message`;
}

/** One-line preview for conversation and contact lists. */
export function whatsappMessagePreview(
  body: string | null | undefined,
): string {
  const text = (body ?? '').trim();
  if (!text) return '';
  const media = MEDIA.exec(text);
  if (media) {
    const label = MEDIA_LABELS[media[1]!] ?? 'Attachment';
    const caption = media[2]?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  const rich = parseWhatsAppRichMessage(text);
  if (rich) return richMessagePreview(rich);
  return whatsappPlaceholderLabel(text) ?? text;
}
