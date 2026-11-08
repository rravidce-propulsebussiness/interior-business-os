import { describe, expect, it } from 'vitest';
import {
  canRequestWhatsAppCallingEnable,
  isWhatsAppCallingEnabled,
  normalizeWhatsAppCallingStatus,
} from './whatsapp-calling-status';

describe('Meta WhatsApp Calling number-level status', () => {
  it.each(['NOT SET', 'NOT_SET', 'not-set', 'not_configured', 'DISABLED'])(
    'offers explicit setup for %s',
    (status) => {
      expect(canRequestWhatsAppCallingEnable(status)).toBe(true);
      expect(isWhatsAppCallingEnabled(status)).toBe(false);
    },
  );

  it('does not offer activation when already enabled', () => {
    expect(isWhatsAppCallingEnabled(' enabled ')).toBe(true);
    expect(canRequestWhatsAppCallingEnable('ENABLED')).toBe(false);
  });

  it('does not assume that a missing status or Meta error is safe to activate', () => {
    expect(canRequestWhatsAppCallingEnable(null)).toBe(false);
    expect(canRequestWhatsAppCallingEnable('UNKNOWN')).toBe(false);
    expect(normalizeWhatsAppCallingStatus({ status: 'NOT SET' })).toBe('');
  });
});
