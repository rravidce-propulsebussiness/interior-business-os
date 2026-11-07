import { describe, expect, it, vi } from 'vitest';
import {
  MetaApiError,
  metaApiErrorFrom,
  metaErrorLabel,
  metaErrorMessage,
  whatsappFailure,
} from './whatsapp-meta-error';
import { readApiResponse } from './whatsapp-response';
import { isMetaOrigin, parseSignupEvent } from './whatsapp-signup-event';
import { routeWebhookChange } from './whatsapp-webhook-routing';

describe('Meta errors', () => {
  it('keeps codes and drops Meta error text', () => {
    const error = metaApiErrorFrom(400, {
      error: {
        message: 'secret account detail',
        code: 133010,
        error_subcode: 2494,
        fbtrace_id: 'trace',
      },
    });
    expect(error).toMatchObject({ code: 133010, subcode: 2494, traceId: 'trace' });
    expect(JSON.stringify(error)).not.toContain('secret account detail');
  });

  it('survives a response with no JSON error', () => {
    expect(metaApiErrorFrom(500, null).code).toBeNull();
    expect(metaApiErrorFrom(500, { error: { code: '190' } }).code).toBeNull();
  });

  it('explains known codes and names unknown ones', () => {
    expect(metaErrorMessage(133005)).toContain('PIN');
    expect(metaErrorMessage(999)).toContain('999');
    expect(metaErrorMessage(null)).not.toContain('null');
  });

  it('labels automation failures', () => {
    expect(metaErrorLabel(new MetaApiError(400, 131030, null, null))).toBe('META_131030');
    expect(metaErrorLabel(new Error('x'))).toBe('META_SEND_FAILED');
  });

  it('returns a safe route failure and logs numbers only', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = whatsappFailure(new MetaApiError(401, 190, 463, 'trace'));
    expect(failure.status).toBe(424);
    expect(failure.body.metaCode).toBe(190);
    expect(failure.body.message).toContain('expired');
    expect(log).toHaveBeenCalledWith('whatsapp_meta_error', {
      httpStatus: 401,
      code: 190,
      subcode: 463,
      traceId: 'trace',
    });
    log.mockRestore();
  });

  it('keeps the generic failure for other errors', () => {
    const failure = whatsappFailure(new Error('database password'));
    expect(failure.status).toBe(500);
    expect(JSON.stringify(failure.body)).not.toContain('database password');
  });
});

describe('Embedded Signup events', () => {
  const finish = (event: string) => ({
    type: 'WA_EMBEDDED_SIGNUP',
    event,
    data: { waba_id: '11111', phone_number_id: '22222' },
  });

  it.each(['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'])(
    'accepts %s',
    (event) => {
      expect(parseSignupEvent(JSON.stringify(finish(event)))).toEqual({
        kind: 'finish',
        wabaId: '11111',
        phoneNumberId: '22222',
      });
    },
  );

  it('reports a finish with no number instead of waiting forever', () => {
    expect(
      parseSignupEvent({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_ONLY_WABA', data: { waba_id: '1' } }),
    ).toEqual({ kind: 'missing-assets' });
  });

  it('separates a real error from a plain cancel', () => {
    expect(parseSignupEvent({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'X' } })).toEqual({ kind: 'cancel' });
    expect(
      parseSignupEvent({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { error_message: 'Bad', error_id: '524126' } }),
    ).toEqual({ kind: 'error', message: 'Bad (Meta error 524126)' });
    expect(parseSignupEvent({ type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR' })?.kind).toBe('error');
  });

  it('ignores other browser messages', () => {
    expect(parseSignupEvent('not json')).toBeNull();
    expect(parseSignupEvent({ type: 'OTHER', event: 'FINISH' })).toBeNull();
    expect(parseSignupEvent({ type: 'WA_EMBEDDED_SIGNUP', event: 'SOMETHING_NEW' })).toBeNull();
  });

  it('only trusts Meta origins', () => {
    expect(isMetaOrigin('https://www.facebook.com')).toBe(true);
    expect(isMetaOrigin('https://facebook.com')).toBe(true);
    expect(isMetaOrigin('https://facebook.com.evil.test')).toBe(false);
    expect(isMetaOrigin('https://notfacebook.com')).toBe(false);
    expect(isMetaOrigin('http://www.facebook.com')).toBe(false);
    expect(isMetaOrigin('garbage')).toBe(false);
  });
});

describe('webhook routing', () => {
  const a = { id: 'a', organization_id: 'org1', phone_number_id: '111' };
  const b = { id: 'b', organization_id: 'org1', phone_number_id: '222' };
  const c = { id: 'c', organization_id: 'org2', phone_number_id: '333' };
  const onNumber = (phone: unknown) => ({ value: { metadata: { phone_number_id: phone } } });

  it('sends a message to the number that received it', () => {
    expect(routeWebhookChange([a, b], onNumber('222'))).toEqual({ kind: 'number', connection: b });
  });

  it('ignores a number with no live connection', () => {
    expect(routeWebhookChange([a], onNumber('999'))).toEqual({ kind: 'ignore' });
  });

  it('ignores everything when nothing is connected', () => {
    expect(routeWebhookChange([], onNumber('111'))).toEqual({ kind: 'ignore' });
    expect(routeWebhookChange([], { value: {} })).toEqual({ kind: 'ignore' });
  });

  it('keeps account-level changes once per company', () => {
    expect(routeWebhookChange([a, b, c], { field: 'x', value: { event: 'APPROVED' } })).toEqual({
      kind: 'account',
      organizationIds: ['org1', 'org2'],
    });
    expect(routeWebhookChange([a], null)).toEqual({ kind: 'account', organizationIds: ['org1'] });
  });
});

describe('browser reply reading', () => {
  it('returns JSON replies unchanged', async () => {
    const reply = new Response('{"message":"PIN is wrong","metaCode":133005}', { status: 424 });
    expect(await readApiResponse(reply)).toEqual({ message: 'PIN is wrong', metaCode: 133005 });
  });

  it('turns a Cloudflare HTML page into a plain message', async () => {
    const reply = new Response('<!DOCTYPE html><title>502: Bad gateway</title>', { status: 502 });
    const result = (await readApiResponse(reply)) as { message: string };
    expect(result.message).toContain('Try again');
    expect(result.message).not.toContain('<');
  });

  it('handles an empty reply', async () => {
    const result = (await readApiResponse(new Response(''))) as { message: string };
    expect(result.message).toContain('Try again');
  });
});

describe('statuses', () => {
  it('never uses a status Cloudflare replaces', async () => {
    const { META_FAILURE_STATUS, INTERNAL_FAILURE_STATUS } = await import('./whatsapp-meta-error');
    for (const status of [META_FAILURE_STATUS, INTERNAL_FAILURE_STATUS])
      expect([502, 504]).not.toContain(status);
  });
});
