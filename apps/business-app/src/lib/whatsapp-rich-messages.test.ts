import { describe, expect, it } from 'vitest';
import {
  buttonsSchema,
  contactCardSchema,
  locationSchema,
  richMessagePayload,
} from './whatsapp-rich-messages';

describe('WhatsApp rich messages', () => {
  it('builds a location pin with a map link for the chat', () => {
    const message = locationSchema.parse({
      messageType: 'location',
      to: '+919876543210',
      latitude: 17.49,
      longitude: 78.39,
      name: 'SG Homes office',
      address: 'Kukatpally, Hyderabad',
    });
    const built = richMessagePayload(message);
    expect(built.payload.to).toBe('919876543210');
    expect(built.payload).toMatchObject({
      type: 'location',
      location: { latitude: 17.49, longitude: 78.39, name: 'SG Homes office' },
    });
    expect(built.logBody).toContain('https://maps.google.com/?q=17.49,78.39');
  });

  it('builds a contact card', () => {
    const built = richMessagePayload(
      contactCardSchema.parse({
        messageType: 'contacts',
        to: '919876543210',
        name: 'Ravi Kumar',
        phone: '+919123456789',
      }),
    );
    expect(built.payload).toMatchObject({
      type: 'contacts',
      contacts: [
        {
          name: { formatted_name: 'Ravi Kumar', first_name: 'Ravi', last_name: 'Kumar' },
          phones: [{ phone: '+919123456789', wa_id: '919123456789' }],
        },
      ],
    });
  });

  it('turns a quick question into up to three tap buttons', () => {
    const built = richMessagePayload(
      buttonsSchema.parse({
        messageType: 'buttons',
        to: '919876543210',
        question: 'When can we visit?',
        options: ['Today', 'Tomorrow', 'Today'],
      }),
    );
    expect(built.payload).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
        action: {
          buttons: [
            { reply: { id: 'opt_1', title: 'Today' } },
            { reply: { id: 'opt_2', title: 'Tomorrow' } },
          ],
        },
      },
    });
    expect(
      buttonsSchema.safeParse({
        messageType: 'buttons',
        to: '919876543210',
        question: 'x',
        options: ['This option is far too long'],
      }).success,
    ).toBe(false);
  });
});
