import { DomainError, safeFailure } from '@business-os/shared';

/**
 * A failed Graph API call. Meta's own error text can contain account and
 * request details, so only numeric codes and the trace ID are kept.
 */
export class MetaApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly traceId: string | null,
  ) {
    super('META_API_FAILED');
    this.name = 'MetaApiError';
  }
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function metaApiErrorFrom(httpStatus: number, body: unknown) {
  const error =
    body && typeof body === 'object'
      ? (body as { error?: Record<string, unknown> }).error
      : undefined;
  return new MetaApiError(
    httpStatus,
    finiteNumber(error?.code),
    finiteNumber(error?.error_subcode),
    typeof error?.fbtrace_id === 'string'
      ? error.fbtrace_id.slice(0, 64)
      : null,
  );
}

const messages: Record<number, string> = {
  4: 'Meta is limiting requests from this app. Wait a few minutes and try again.',
  10: 'The Meta app does not have permission for this action. Check App Review, advanced access, and the app roles.',
  190: 'The Meta access token has expired or was revoked. Disconnect this number and connect it again.',
  200: 'The Meta app does not have permission for this action. Check App Review, advanced access, and the app roles.',
  80007:
    'This WhatsApp account has reached a Meta rate limit. Wait and try again.',
  130429: 'This number is sending faster than Meta allows. Wait and try again.',
  131026:
    'Meta could not deliver to this recipient. Check that the number uses WhatsApp.',
  131030:
    'This recipient is not on the Meta test recipient list for this number.',
  131031:
    'Meta has locked this WhatsApp Business Account. Check WhatsApp Manager.',
  131042:
    'Meta reported a billing problem. Check the payment method in WhatsApp Manager.',
  131047:
    'More than 24 hours have passed since this contact last wrote. Send an approved template instead.',
  131056:
    'Too many messages were sent to this contact too quickly. Wait and try again.',
  132001: 'Meta could not find this template in the selected language.',
  133004: 'WhatsApp is temporarily unavailable. Try again shortly.',
  133005: 'The six-digit WhatsApp two-step verification PIN is not correct.',
  133006: 'This phone number must be verified again before registration.',
  133010:
    'This phone number is not registered with WhatsApp Cloud API. Register it with its six-digit PIN first.',
  138000:
    'WhatsApp Calling is not enabled for this business number. Enable calling in WhatsApp Manager and verify eligibility.',
  138001: 'The WhatsApp recipient cannot receive a voice call at present.',
  138006:
    'This customer has not granted WhatsApp call permission. Send a permission request and wait for approval.',
  138012:
    'Meta has limited calls for this WhatsApp number. Check calling limits and retry later.',
};

export function metaErrorMessage(code: number | null) {
  const known = code === null ? undefined : messages[code];
  if (known) return known;
  return code === null
    ? 'Meta could not complete this WhatsApp request. Try again.'
    : `Meta could not complete this WhatsApp request (Meta error ${code}).`;
}

/** Stable label for the safe error column on automation runs. */
export function metaErrorLabel(error: unknown) {
  return error instanceof MetaApiError && error.code !== null
    ? `META_${error.code}`
    : 'META_SEND_FAILED';
}

/** Numbers and the trace ID only. Never log Meta's error text or a token. */
export function logMetaError(error: MetaApiError) {
  console.error('whatsapp_meta_error', {
    httpStatus: error.httpStatus,
    code: error.code,
    subcode: error.subcode,
    traceId: error.traceId,
  });
}

/**
 * Cloudflare replaces an origin 502 or 504 with its own HTML page, which hides
 * the reply. Use these instead so the browser receives the message.
 */
export const META_FAILURE_STATUS = 424;
export const INTERNAL_FAILURE_STATUS = 500;

/** Status and browser-safe body for a failed WhatsApp API route. */
export function whatsappFailure(error: unknown): {
  status: number;
  body: { message: string; requestId?: string; metaCode?: number };
} {
  if (error instanceof MetaApiError) {
    logMetaError(error);
    return {
      status: META_FAILURE_STATUS,
      body: {
        message: metaErrorMessage(error.code),
        ...(error.code === null ? {} : { metaCode: error.code }),
      },
    };
  }
  return {
    status:
      error instanceof DomainError
        ? error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : 403
        : INTERNAL_FAILURE_STATUS,
    body: safeFailure(error),
  };
}
