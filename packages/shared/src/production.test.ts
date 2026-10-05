import { expect, it, vi } from 'vitest';
import {
  validateDeploymentEnvironment,
  isPublicKey,
  operationalLog,
} from './runtime';
import { createReadiness, liveness } from './health';
import { adminContentSecurityPolicy } from './security';

const environment = {
  APP_ENV: 'staging',
  SUPABASE_ENVIRONMENT: 'staging',
  APP_ORIGIN: 'https://business.acme.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  BROCHURE_PUBLIC_ORIGIN: 'https://public.acme.com',
};
it('rejects missing, mismatched and privileged deployment configuration without printing values', () => {
  // Build a synthetic password-bearing loopback URL; this is not a stored credential.
  const workerFixture = new URL(
    'postgresql://worker@127.0.0.1/test?sslmode=disable',
  );
  workerFixture.password = 'do-not-log';
  expect(() => validateDeploymentEnvironment({}, 'websites')).toThrow(
    'APP_ENV',
  );
  expect(() =>
    validateDeploymentEnvironment(environment, 'websites'),
  ).not.toThrow();
  expect(() =>
    validateDeploymentEnvironment(
      { ...environment, SUPABASE_ENVIRONMENT: 'production' },
      'websites',
    ),
  ).toThrow('SUPABASE_ENVIRONMENT');
  expect(() =>
    validateDeploymentEnvironment(
      {
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-log',
      },
      'websites',
    ),
  ).toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  expect(() =>
    validateDeploymentEnvironment(
      { ...environment, TEST_DATABASE_URL: 'do-not-log' },
      'websites',
    ),
  ).toThrow('TEST/E2E');
  for (const key of ['ACCEPTANCE_PROJECT_REF', 'HOSTED_DATABASE_URL']) {
    expect(() =>
      validateDeploymentEnvironment(
        { ...environment, [key]: 'do-not-log' },
        'websites',
      ),
    ).toThrow('TEST/E2E');
  }
  expect(() =>
    validateDeploymentEnvironment(environment, 'business-app'),
  ).toThrow('QUOTATION_SIGNING_KEY');
  expect(() =>
    validateDeploymentEnvironment(
      {
        ...environment,
        AUTOMATION_DATABASE_URL: workerFixture.toString(),
      },
      'worker',
    ),
  ).toThrow('AUTOMATION_DATABASE_URL');
});
it('accepts only publishable or legacy anon keys', () => {
  const jwt = (role: string) =>
    `header.${btoa(JSON.stringify({ role }))}.signature`;
  expect(isPublicKey(jwt('anon'))).toBe(true);
  expect(isPublicKey(jwt('service_role'))).toBe(false);
  expect(isPublicKey('sb_secret_value')).toBe(false);
});
it('rejects private and placeholder hosted origins and invalid log levels', () => {
  for (const origin of [
    'http://localhost:3001',
    'https://10.0.0.1',
    'https://192.168.1.1',
    'https://172.16.0.1',
    'https://app.invalid',
    'https://app.test',
    'https://[::1]',
  ]) {
    expect(() =>
      validateDeploymentEnvironment(
        { ...environment, APP_ORIGIN: origin },
        'websites',
      ),
    ).toThrow('APP_ORIGIN');
  }
  expect(() =>
    validateDeploymentEnvironment(
      { ...environment, LOG_LEVEL: 'verbose' },
      'websites',
    ),
  ).toThrow('LOG_LEVEL');
});
it('uses legacy anon JWT authorization without exposing the readiness credential', async () => {
  const key = `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`;
  const probe = vi.fn().mockResolvedValue(new Response('true'));
  const response = await createReadiness(
    { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
    probe,
  )();
  expect(response.status).toBe(200);
  expect(probe.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${key}`);
  expect(await response.text()).not.toContain(key);
});
it('distinguishes process liveness from unavailable readiness without leaking diagnostics', async () => {
  expect(liveness().status).toBe(200);
  const read = createReadiness(
    environment,
    vi.fn().mockRejectedValue(new Error('database-password')),
  );
  const response = await read();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"status":"unavailable"}');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('coalesces concurrent dependency probes and checks HTTP failures', async () => {
  const probe = vi
    .fn()
    .mockResolvedValue(new Response('true', { status: 200 }));
  const read = createReadiness(environment, probe);
  const responses = await Promise.all(Array.from({ length: 20 }, () => read()));
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(probe).toHaveBeenCalledTimes(1);
  const denied = createReadiness(
    environment,
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  expect((await denied()).status).toBe(503);
});
it('production admin CSP rejects inline/eval scripts and framing', () => {
  const csp = adminContentSecurityPolicy('validNonce');
  expect(csp).toContain(
    "script-src 'self' 'nonce-validNonce' 'strict-dynamic'",
  );
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(() => adminContentSecurityPolicy("bad'; script-src *")).toThrow();
});
it('logs allowlisted structured metadata and suppresses debug by default', () => {
  const sink = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    operationalLog(
      {
        level: 'error',
        service: 'business-app',
        event: 'request.failed',
        requestId: 'valid-id',
        errorCode: 'password=private',
      },
      { APP_ENV: 'production' },
    );
    expect(sink.mock.calls[0]![0]).not.toContain('private');
    expect(JSON.parse(sink.mock.calls[0]![0]).severity).toBe('error');
    operationalLog(
      { level: 'debug', service: 'worker', event: 'tick', requestId: 'id' },
      {},
    );
    expect(sink).toHaveBeenCalledTimes(1);
  } finally {
    sink.mockRestore();
  }
});
