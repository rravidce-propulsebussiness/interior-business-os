/**
 * Human-readable text for stored WhatsApp message bodies.
 *
 * Webhook ingest stores message types that carry no text as "[<type> message]"
 * and media as "[[WA_MEDIA:<id>:<kind>]]" (plus an optional caption line).
 * Those raw markers must never be shown to staff as-is.
 */
const PLACEHOLDER = /^\[([a-z_]{1,40}) message\]$/;
const MEDIA =
  /^\[\[WA_MEDIA:[A-Za-z0-9._-]{1,200}:(image|video|audio|document)\]\](?:\r?\n([\s\S]*))?$/;

const TYPE_LABELS: Record<string, string> = {
  unsupported:
    'Message type not supported here — open WhatsApp on your phone to view it',
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
};

/** Placeholder label for a non-text, non-media message, or null for normal text. */
export function whatsappPlaceholderLabel(body: string): string | null {
  const match = PLACEHOLDER.exec(body.trim());
  if (!match) return null;
  const type = match[1]!;
  return TYPE_LABELS[type] ?? `${type.replace(/_/g, ' ')} message`;
}

/** One-line preview for conversation and contact lists. */
export function whatsappMessagePreview(body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (!text) return '';
  const media = MEDIA.exec(text);
  if (media) {
    const label = MEDIA_LABELS[media[1]!] ?? 'Attachment';
    const caption = media[2]?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return whatsappPlaceholderLabel(text) ?? text;
}
