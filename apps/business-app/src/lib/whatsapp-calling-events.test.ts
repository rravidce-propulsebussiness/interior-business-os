import { describe, expect, it } from 'vitest';
import { eventForConnection } from './whatsapp-calling-events';

const numberId = '123456789';
const connectionId = '11111111-1111-4111-8111-111111111111';

function signedChange(calls: unknown[], phone = numberId) {
  return {
    waba_id: '987654321',
    change: {
      field: 'calls',
      value: {
        metadata: { phone_number_id: phone },
        calls,
      },
    },
  };
}

describe('Meta WhatsApp Calling webhook routing', () => {
  it('routes an inbound SDP offer only to the matching business number', () => {
    const change = signedChange([
      {
        id: 'wacid.test123',
        event: 'connect',
        direction: 'USER_INITIATED',
        from: '919900000000',
        to: '919111111111',
        timestamp: '1794156000',
        session: { sdp_type: 'offer', sdp: 'v=0\r\na=setup:actpass\r\n' },
      },
    ]);
    expect(eventForConnection(change, numberId, connectionId)).toEqual([
      {
        id: 'wacid.test123',
        event: 'connect',
        direction: 'USER_INITIATED',
        from: '919900000000',
        to: '919111111111',
        timestamp: 1794156000,
        session: { sdp_type: 'offer', sdp: 'v=0\r\na=setup:actpass\r\n' },
      },
    ]);
    expect(eventForConnection(change, 'another-number', connectionId)).toEqual(
      [],
    );
  });

  it('records an outbound call only when connection id matches', () => {
    const record = {
      kind: 'outbound_call',
      connection_id: connectionId,
      call_id: 'wacid.outbound',
      to: '919900000000',
      timestamp: 1794156000,
    };
    expect(eventForConnection(record, numberId, connectionId)[0]).toMatchObject(
      {
        id: 'wacid.outbound',
        event: 'dialing',
        direction: 'BUSINESS_INITIATED',
      },
    );
    expect(eventForConnection(record, numberId, 'other-connection')).toEqual(
      [],
    );
  });

  it('handles termination and rejects missing, oversized and unrelated SDP', () => {
    const change = signedChange([
      { id: 'wacid.stop', event: 'terminate', timestamp: 1794156050 },
      { id: '', event: 'connect' },
      { id: 'wacid.large', session: { sdp: 'x'.repeat(150001) } },
    ]);
    const events = eventForConnection(change, numberId, connectionId);
    expect(events.length).toBe(2);
    expect(events[0]?.event).toBe('terminate');
    expect(events[1]?.session).toBeUndefined();
    expect(
      eventForConnection({ unexpected: true }, numberId, connectionId),
    ).toEqual([]);
  });
});
