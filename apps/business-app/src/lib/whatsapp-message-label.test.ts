import { describe, expect, it } from 'vitest';
import {
  whatsappMessagePreview,
  whatsappPlaceholderLabel,
} from './whatsapp-message-label';

describe('WhatsApp message labels', () => {
  it('replaces raw placeholder markers with readable text', () => {
    expect(whatsappMessagePreview('[unsupported message]')).toMatch(
      /^Message type not supported/,
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
  });

  it('leaves normal text untouched', () => {
    expect(whatsappMessagePreview('Hi, I need a quote')).toBe(
      'Hi, I need a quote',
    );
    expect(whatsappPlaceholderLabel('[not a marker]')).toBeNull();
    expect(whatsappMessagePreview(null)).toBe('');
  });
});
