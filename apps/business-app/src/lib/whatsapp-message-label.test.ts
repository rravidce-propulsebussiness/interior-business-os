import { describe, expect, it } from 'vitest';
import {
  parseWhatsAppRichMessage,
  whatsappMessagePreview,
  whatsappPlaceholderLabel,
} from './whatsapp-message-label';

describe('WhatsApp message labels', () => {
  it('replaces raw placeholder markers with readable text', () => {
    expect(whatsappMessagePreview('[unsupported message]')).toBe(
      'Message type not supported by WhatsApp Business Platform',
    );
    expect(whatsappMessagePreview('[reaction message]')).toBe(
      'Reacted to a message',
    );
    expect(whatsappMessagePreview('[some_new_type message]')).toBe(
      'some new type message',
    );
  });

  it('summarises media with its caption', () => {
    expect(whatsappMessagePreview('[[WA_MEDIA:abc123:image]]')).toBe('Photo');
    expect(
      whatsappMessagePreview('[[WA_MEDIA:abc123:document]]\nQuote.pdf'),
    ).toBe('Document: Quote.pdf');
    expect(whatsappMessagePreview('[[WA_MEDIA:sticker123:sticker]]')).toBe(
      'Sticker',
    );
  });

  it('summarises structured WhatsApp message types', () => {
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:location]]\n{"type":"location","location":{"name":"Site","address":"Kukatpally"}}',
      ),
    ).toBe('Site · Kukatpally');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:reaction]]\n{"type":"reaction","reaction":{"emoji":"❤️"}}',
      ),
    ).toBe('Reaction: ❤️');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:interactive]]\n{"type":"interactive","interactive":{"list_reply":{"title":"Project estimate"}}}',
      ),
    ).toBe('Project estimate');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:contacts]]\n{"type":"contacts","contacts":[{"name":{"formatted_name":"Ravi Naik"}}]}',
      ),
    ).toBe('Contact: Ravi Naik');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:button]]\n{"type":"button","button":{"text":"Yes"}}',
      ),
    ).toBe('Yes');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:order]]\n{"type":"order","order":{"product_items":[]}}',
      ),
    ).toBe('Order received');
    expect(
      whatsappMessagePreview(
        '[[WA_JSON:future_type]]\n{"type":"future_type","future_type":{"value":"kept"}}',
      ),
    ).toBe('future type message');
    expect(
      parseWhatsAppRichMessage(
        '[[WA_JSON:order]]\n{"type":"order","order":{"product_items":[]}}',
      )?.content.product_items,
    ).toEqual([]);
    expect(parseWhatsAppRichMessage('[[WA_JSON:contacts]]\n{broken')).toBe(
      null,
    );
  });

  it('leaves normal text untouched', () => {
    expect(whatsappMessagePreview('Hi, I need a quote')).toBe(
      'Hi, I need a quote',
    );
    expect(whatsappPlaceholderLabel('[not a marker]')).toBeNull();
    expect(whatsappMessagePreview(null)).toBe('');
  });
});
