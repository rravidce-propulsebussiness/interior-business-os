import { describe, expect, it } from 'vitest';
import { metaBillingUrl, whatsappErrorHelp } from './whatsapp-error-help';

describe('WhatsApp error help', () => {
  it('turns 131042 into an add-money prompt with the account billing link', () => {
    const help = whatsappErrorHelp('131042', '1596173445154926');
    expect(help?.payment).toBe(true);
    expect(help?.link?.href).toBe(
      'https://business.facebook.com/latest/billing_hub/accounts?asset_id=1596173445154926',
    );
  });

  it('explains the 24-hour window and ignores empty codes', () => {
    expect(whatsappErrorHelp(131047)?.reason).toMatch(/24 hours/);
    expect(whatsappErrorHelp('')).toBeNull();
    expect(whatsappErrorHelp(undefined)).toBeNull();
  });

  it('never builds a link from an unsafe account id', () => {
    expect(metaBillingUrl('x"><script>')).toBe(
      'https://business.facebook.com/latest/billing_hub/accounts',
    );
  });
});
