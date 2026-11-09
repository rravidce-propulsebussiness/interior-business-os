import { z } from 'zod';

/** Location pin, contact card and quick-question (tap buttons) messages. */
export const locationSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('location'),
    to: z.string().regex(/^\+?[1-9]\d{7,14}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().trim().max(100).default(''),
    address: z.string().trim().max(300).default(''),
  })
  .strict();

export const contactCardSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('contacts'),
    to: z.string().regex(/^\+?[1-9]\d{7,14}$/),
    name: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  })
  .strict();

export const buttonsSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    messageType: z.literal('buttons'),
    to: z.string().regex(/^\+?[1-9]\d{7,14}$/),
    question: z.string().trim().min(1).max(1024),
    options: z.array(z.string().trim().min(1).max(20)).min(2).max(3),
  })
  .strict();

export type RichMessage =
  | z.infer<typeof locationSchema>
  | z.infer<typeof contactCardSchema>
  | z.infer<typeof buttonsSchema>;

export function digitsOnly(phone: string) {
  return phone.replace(/^\+/, '');
}

/** Meta payload plus the text shown in the Business OS chat. */
export function richMessagePayload(message: RichMessage) {
  const to = digitsOnly(message.to);
  if (message.messageType === 'location') {
    const map = `https://maps.google.com/?q=${message.latitude},${message.longitude}`;
    return {
      payload: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'location',
        location: {
          latitude: message.latitude,
          longitude: message.longitude,
          ...(message.name ? { name: message.name } : {}),
          ...(message.address ? { address: message.address } : {}),
        },
      },
      logBody: `📍 ${message.name || 'Location'}${message.address ? `, ${message.address}` : ''}\n${map}`,
      logType: 'location',
    };
  }
  if (message.messageType === 'contacts') {
    const phone = digitsOnly(message.phone);
    const [first, ...rest] = message.name.split(/\s+/);
    return {
      payload: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: message.name,
              first_name: first || message.name,
              ...(rest.length ? { last_name: rest.join(' ') } : {}),
            },
            phones: [{ phone: `+${phone}`, wa_id: phone, type: 'CELL' }],
          },
        ],
      },
      logBody: `👤 Contact: ${message.name} +${phone}`,
      logType: 'contacts',
    };
  }
  const options = [...new Set(message.options)];
  return {
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.question },
        action: {
          buttons: options.map((title, index) => ({
            type: 'reply',
            reply: { id: `opt_${index + 1}`, title },
          })),
        },
      },
    },
    logBody: `📊 ${message.question}\n${options.map((title, index) => `${index + 1}. ${title}`).join('\n')}`,
    logType: 'interactive',
  };
}
