import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliverEmail } from './automation-email.mjs';

const delivery = {
  recipient: 'recipient@example.test',
  subject: 'Invoice reminder',
  text: 'Outstanding: 120.00',
  idempotencyKey: 'business-os-email/11111111-1111-1111-1111-111111111111',
};
const configuration = {
  apiKey: 'test-key',
  from: 'Business <sender@example.test>',
};

test('missing provider configuration does not attempt a delivery', async () => {
  assert.deepEqual(
    await deliverEmail(delivery, {}, () => {
      throw new Error('Unexpected request');
    }),
    { result: 'unconfigured' },
  );
});
test('sender header injection is rejected before transport', async () => {
  assert.deepEqual(
    await deliverEmail(
      delivery,
      {
        ...configuration,
        from: 'sender@example.test\r\nBcc: other@example.test',
      },
      () => {
        throw new Error('Unexpected request');
      },
    ),
    { result: 'permanent' },
  );
});
test('ambiguous delivery retry preserves the provider key and exact body', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new Error('Connection lost after acceptance');
    return new Response(JSON.stringify({ id: 'provider-message-id' }), {
      status: 200,
    });
  };
  assert.deepEqual(await deliverEmail(delivery, configuration, request), {
    result: 'transient',
  });
  assert.deepEqual(await deliverEmail(delivery, configuration, request), {
    result: 'sent',
    providerId: 'provider-message-id',
  });
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(
    calls[0].options.headers['Idempotency-Key'],
    delivery.idempotencyKey,
  );
  assert.equal(
    calls[1].options.headers['Idempotency-Key'],
    delivery.idempotencyKey,
  );
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: configuration.from,
    to: [delivery.recipient],
    subject: delivery.subject,
    text: delivery.text,
  });
});
for (const [status, result] of [
  [409, 'transient'],
  [429, 'transient'],
  [503, 'transient'],
  [400, 'permanent'],
  [401, 'permanent'],
  [422, 'permanent'],
]) {
  test(`provider HTTP ${status} is classified as ${result}`, async () => {
    assert.deepEqual(
      await deliverEmail(
        delivery,
        configuration,
        async () => new Response('{}', { status }),
      ),
      { result },
    );
  });
}
test('successful HTTP without a valid acknowledgement cannot report sent', async () => {
  for (const body of ['{}', '{', JSON.stringify({ id: 'x'.repeat(201) })]) {
    assert.deepEqual(
      await deliverEmail(
        delivery,
        configuration,
        async () => new Response(body),
      ),
      { result: 'transient' },
    );
  }
});
