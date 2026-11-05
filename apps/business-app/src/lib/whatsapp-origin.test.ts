import { afterEach, describe, expect, it } from 'vitest';
import { validSameOrigin } from './whatsapp-origin';

const previousOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
});

describe('validSameOrigin', () => {
  it('matches the configured public application origin behind a proxy', () => {
    process.env.APP_ORIGIN = 'https://sghomesinterior.in/';
    const request = new Request(
      'http://127.0.0.1:3000/api/whatsapp/templates',
      { method: 'POST', headers: { origin: 'https://sghomesinterior.in' } },
    );
    expect(validSameOrigin(request)).toBe(true);
  });

  it('rejects a different configured origin', () => {
    process.env.APP_ORIGIN = 'https://sghomesinterior.in';
    const request = new Request(
      'http://127.0.0.1:3000/api/whatsapp/templates',
      { method: 'POST', headers: { origin: 'https://attacker.example' } },
    );
    expect(validSameOrigin(request)).toBe(false);
  });

  it('uses forwarded host and protocol when APP_ORIGIN is not configured', () => {
    delete process.env.APP_ORIGIN;
    const request = new Request(
      'http://127.0.0.1:3000/api/whatsapp/templates',
      {
        method: 'POST',
        headers: {
          origin: 'https://sghomesinterior.in',
          'x-forwarded-host': 'sghomesinterior.in',
          'x-forwarded-proto': 'https',
        },
      },
    );
    expect(validSameOrigin(request)).toBe(true);
  });

  it('rejects missing, malformed, and mismatched origins', () => {
    delete process.env.APP_ORIGIN;
    expect(
      validSameOrigin(
        new Request('https://sghomesinterior.in/api/whatsapp/templates', {
          method: 'POST',
        }),
      ),
    ).toBe(false);
    expect(
      validSameOrigin(
        new Request('https://sghomesinterior.in/api/whatsapp/templates', {
          method: 'POST',
          headers: { origin: 'not-a-url' },
        }),
      ),
    ).toBe(false);
    expect(
      validSameOrigin(
        new Request('https://sghomesinterior.in/api/whatsapp/templates', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toBe(false);
  });
});
