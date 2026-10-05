/** Deployment configuration contains secrets: return names of invalid fields, never values. */
export type Environment = Record<string, string | undefined>;
export type Service = 'business-app' | 'platform-admin' | 'websites' | 'worker';
const hosted = (value: string | undefined) => {
  try {
    const url = new URL(value ?? '');
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/' &&
      !/localhost|example\.|\.(?:test|invalid|local)$|your-project|^(?:127|10|0|169\.254|192\.168)\.|^172\.(?:1[6-9]|2\d|3[01])\.|^\[(?:::|f[cd]|fe80)/i.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
};
export const isHostedOrigin = hosted;
export function isPublicKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split('.');
    return (
      parts.length === 3 &&
      JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role ===
        'anon'
    );
  } catch {
    return false;
  }
}
export function validateDeploymentEnvironment(
  env: Environment,
  service: Service,
) {
  const invalid = new Set<string>();
  const stage = env.APP_ENV;
  if (!['development', 'staging', 'production'].includes(stage ?? ''))
    invalid.add('APP_ENV');
  if (
    env.LOG_LEVEL &&
    !['debug', 'info', 'warn', 'error'].includes(env.LOG_LEVEL)
  )
    invalid.add('LOG_LEVEL');
  for (const [key, value] of Object.entries(env)) {
    if (
      key.startsWith('NEXT_PUBLIC_') &&
      value &&
      /SECRET|PASSWORD|SIGNING|DATABASE|SERVICE_ROLE|PRIVATE/.test(key)
    )
      invalid.add(key);
  }
  if (stage !== 'development') {
    if (
      env.TEST_DATABASE_URL ||
      Object.keys(env).some(
        (key) =>
          (key.startsWith('E2E_') ||
            key.startsWith('ACCEPTANCE_') ||
            key.startsWith('HOSTED_')) &&
          env[key],
      )
    )
      invalid.add('TEST/E2E variables');
    if (env.LOG_LEVEL === 'debug') invalid.add('LOG_LEVEL');
    if (service !== 'worker') {
      if (!hosted(env.NEXT_PUBLIC_SUPABASE_URL))
        invalid.add('NEXT_PUBLIC_SUPABASE_URL');
      if (!isPublicKey(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''))
        invalid.add('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
      if (!hosted(env.APP_ORIGIN)) invalid.add('APP_ORIGIN');
      if (
        !['staging', 'production'].includes(env.SUPABASE_ENVIRONMENT ?? '') ||
        env.SUPABASE_ENVIRONMENT !== stage
      )
        invalid.add('SUPABASE_ENVIRONMENT');
      if (env.AUTOMATION_DATABASE_URL || env.AUTOMATION_EMAIL_API_KEY)
        invalid.add('worker credentials in app');
    }
    if (service === 'business-app' || service === 'platform-admin') {
      if (!/^[a-f0-9]{64}$/.test(env.AUTH_RECOVERY_SIGNING_KEY ?? ''))
        invalid.add('AUTH_RECOVERY_SIGNING_KEY');
    }
    if (service === 'business-app') {
      if (!/^[a-f0-9]{64}$/.test(env.QUOTATION_SIGNING_KEY ?? ''))
        invalid.add('QUOTATION_SIGNING_KEY');
      const signing = (value: string | undefined) =>
        (value ?? '').length >= 32 &&
        !/^(?:phase\d+-test|replace|your-|placeholder)/i.test(value ?? '');
      if (!signing(env.WEBSITE_BUILD_SIGNING_KEY))
        invalid.add('WEBSITE_BUILD_SIGNING_KEY');
      if (
        !signing(
          env.BROCHURE_BUILD_SIGNING_KEY ?? env.WEBSITE_BUILD_SIGNING_KEY,
        )
      )
        invalid.add('BROCHURE_BUILD_SIGNING_KEY');
    }
    if (service === 'websites' || service === 'business-app') {
      if (!hosted(env.BROCHURE_PUBLIC_ORIGIN))
        invalid.add('BROCHURE_PUBLIC_ORIGIN');
    }
    if (service === 'worker') {
      try {
        const url = new URL(env.AUTOMATION_DATABASE_URL ?? '');
        if (
          !['postgres:', 'postgresql:'].includes(url.protocol) ||
          url.searchParams.get('sslmode') !== 'verify-full' ||
          !url.username ||
          !url.password ||
          /localhost|127\.|\[::1\]/.test(url.hostname)
        )
          invalid.add('AUTOMATION_DATABASE_URL');
      } catch {
        invalid.add('AUTOMATION_DATABASE_URL');
      }
      if (
        Boolean(env.AUTOMATION_EMAIL_API_KEY) !==
        Boolean(env.AUTOMATION_EMAIL_FROM)
      )
        invalid.add('AUTOMATION_EMAIL configuration');
    }
  }
  if (invalid.size)
    throw new Error(
      `Invalid deployment configuration: ${[...invalid].sort().join(', ')}`,
    );
}

/** One deadline, preserving caller cancellation. No URL/body is included in errors or logs. */
export const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });

export interface OperationalEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  requestId: string;
  service: string;
  errorCode?: string;
  durationMs?: number;
  status?: number;
}
export function operationalLog(
  event: OperationalEvent,
  env: Environment = process.env,
) {
  const levels = ['debug', 'info', 'warn', 'error'];
  const threshold = env.LOG_LEVEL ?? 'info';
  if (levels.indexOf(event.level) < Math.max(0, levels.indexOf(threshold)))
    return;
  // Copy fields explicitly: unknown request data and Error objects never reach the sink.
  const safe = (value: string) =>
    /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : 'redacted';
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      environment: ['development', 'staging', 'production'].includes(
        env.APP_ENV ?? '',
      )
        ? env.APP_ENV
        : 'unconfigured',
      severity: event.level,
      service: safe(event.service),
      event: safe(event.event),
      requestId: safe(event.requestId),
      ...(event.errorCode ? { errorCode: safe(event.errorCode) } : {}),
      ...(Number.isFinite(event.durationMs)
        ? { durationMs: event.durationMs }
        : {}),
      ...(Number.isInteger(event.status) ? { status: event.status } : {}),
    }),
  );
}
