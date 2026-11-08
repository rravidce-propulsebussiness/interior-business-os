import { describe, expect, it } from 'vitest';
import {
  canStartWhatsAppCall,
  customerGrantedCalling,
  metaCallActionAllowed,
} from './whatsapp-calling-permission';

describe('WhatsApp Cloud Calling permissions', () => {
  const actions = [
    { action_name: 'send_call_permission_request', can_perform_action: false },
    { action_name: 'start_call', can_perform_action: true },
  ];

  it('reads actions from the top level, not under permission', () => {
    const result = { permission: { status: 'permanent' }, actions };
    expect(canStartWhatsAppCall(result)).toBe(true);
    expect(metaCallActionAllowed(result, 'send_call_permission_request')).toBe(
      false,
    );
  });

  it('permits active temporary permissions only', () => {
    const now = 1_770_000_000;
    expect(
      canStartWhatsAppCall(
        {
          permission: { status: 'temporary', expiration_time: now + 3600 },
          actions,
        },
        now,
      ),
    ).toBe(true);
    expect(
      canStartWhatsAppCall(
        {
          permission: { status: 'temporary', expiration_time: now - 1 },
          actions,
        },
        now,
      ),
    ).toBe(false);
  });

  it('does not treat messaging opt-in or pending requests as voice consent', () => {
    for (const status of [
      'no_permission',
      'pending',
      'denied',
      'revoked',
      'expired',
    ]) {
      expect(canStartWhatsAppCall({ permission: { status }, actions })).toBe(
        false,
      );
    }
    expect(customerGrantedCalling(null)).toBe(false);
  });

  it('respects per-contact start-call limits even with permanent permission', () => {
    expect(
      canStartWhatsAppCall({
        permission: { status: 'permanent' },
        actions: [{ action_name: 'start_call', can_perform_action: false }],
      }),
    ).toBe(false);
  });

  it('never assumes missing or malformed action limits are consent', () => {
    expect(canStartWhatsAppCall({ permission: { status: 'permanent' } })).toBe(
      false,
    );
    expect(metaCallActionAllowed(null, 'start_call')).toBe(false);
    expect(
      metaCallActionAllowed(
        { permission: { status: 'permanent' } },
        'send_call_permission_request',
      ),
    ).toBe(false);
  });

  it('checks call-permission request quota independently of call permission', () => {
    expect(
      metaCallActionAllowed(
        {
          permission: { status: 'no_permission' },
          actions: [
            {
              action_name: 'send_call_permission_request',
              can_perform_action: true,
            },
          ],
        },
        'send_call_permission_request',
      ),
    ).toBe(true);
  });
});
