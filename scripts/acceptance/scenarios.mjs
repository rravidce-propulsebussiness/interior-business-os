import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { groups, bareOrigin, identityNames } from './config.mjs';
import { request, assert, AcceptanceError } from './http.mjs';
import { runCheck } from './checks.mjs';
import { PDFDocument } from 'pdf-lib';

const ops = new Set([
  'equals',
  'nonempty',
  'empty',
  'contains',
  'number-at-least',
  'pdf',
]);
const forbidden = /password|token|secret|cookie|authorization|reset.*url/i;
export function pointer(value, path) {
  if (path === '') return value;
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('__proto__') ||
    path.includes('constructor') ||
    path.includes('prototype')
  )
    throw new Error('INVALID_JSON_POINTER');
  return path
    .slice(1)
    .split('/')
    .reduce(
      (v, k) => v?.[k.replaceAll('~1', '/').replaceAll('~0', '~')],
      value,
    );
}
export function validateScenarios(plan) {
  if (!Array.isArray(plan) || plan.length > 250)
    throw new Error('INVALID_SCENARIO_PLAN');
  const ids = new Set();
  for (const c of plan) {
    if (
      !/^[a-z0-9_.-]+$/.test(c.id) ||
      !groups.includes(c.id.split('.')[0]) ||
      ids.has(c.id) ||
      !Array.isArray(c.steps) ||
      !c.steps.length ||
      c.steps.length > 100 ||
      !c.steps.some((s) => s.kind !== 'wait')
    )
      throw new Error('INVALID_SCENARIO');
    ids.add(c.id);
    for (const s of c.steps) {
      if (s.kind === 'rpc' && s.method !== 'POST')
        throw new Error('INVALID_RPC_METHOD');
      if (!['rpc', 'rest', 'application', 'provider', 'wait'].includes(s.kind))
        throw new Error('INVALID_STEP_KIND');
      if (s.kind === 'wait') {
        if (!Number.isInteger(s.ms) || s.ms < 1 || s.ms > 60000)
          throw new Error('UNBOUNDED_WAIT');
        continue;
      }
      if (
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(s.method) ||
        !Array.isArray(s.assert) ||
        !s.assert.length ||
        !Number.isInteger(s.status) ||
        s.status < 100 ||
        s.status > 599
      )
        throw new Error('ASSERTION_REQUIRED');
      if (
        s.actor &&
        s.actor !== 'anonymous' &&
        !identityNames.includes(s.actor)
      )
        throw new Error('INVALID_ACTOR');
      if (s.kind === 'rpc' && !/^[a-z][a-z0-9_]+$/.test(s.path))
        throw new Error('INVALID_RPC_NAME');
      if (
        s.kind !== 'rpc' &&
        (typeof s.path !== 'string' ||
          !s.path.startsWith('/') ||
          s.path.startsWith('//') ||
          s.path.includes('\\') ||
          s.path.includes('#'))
      )
        throw new Error('INVALID_PATH');
      if (
        s.kind === 'application' &&
        ![
          'PLATFORM_ADMIN_ORIGIN',
          'BUSINESS_APP_ORIGIN',
          'WEBSITES_ORIGIN',
        ].includes(s.origin)
      )
        throw new Error('INVALID_APP_ORIGIN');
      if (
        s.kind === 'provider' &&
        ![
          'ACCEPTANCE_INBOX_URL',
          'ACCEPTANCE_WORKER_CONTROL_URL',
          'ACCEPTANCE_MONITORING_URL',
          'ACCEPTANCE_BACKUP_CONTROL_URL',
          'ACCEPTANCE_DEPLOYMENT_CONTROL_URL',
        ].includes(s.origin)
      )
        throw new Error('INVALID_PROVIDER_ORIGIN');
      for (const a of s.assert)
        if (
          !ops.has(a.op) ||
          typeof a.pointer !== 'string' ||
          (a.op === 'equals' && !Object.hasOwn(a, 'value'))
        )
          throw new Error('INVALID_ASSERTION');
      for (const [name, p] of Object.entries(s.capture ?? {}))
        if (
          !/^[a-z][a-zA-Z0-9]*$/.test(name) ||
          forbidden.test(name) ||
          forbidden.test(p) ||
          typeof p !== 'string'
        )
          throw new Error('SECRET_CAPTURE_FORBIDDEN');
      // A denial must assert the provider's authorization code, not any error.
      if (
        [401, 403].includes(s.status) &&
        !s.assert.some(
          (a) =>
            a.op === 'equals' && ['/code', '/error_code'].includes(a.pointer),
        )
      )
        throw new Error('DENIAL_CODE_REQUIRED');
    }
  }
  return plan;
}
export function resolveValue(value, variables, env) {
  if (Array.isArray(value))
    return value.map((v) => resolveValue(v, variables, env));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        resolveValue(v, variables, env),
      ]),
    );
  if (typeof value === 'string' && /^\$\{[a-zA-Z0-9_]+\}$/.test(value)) {
    const name = value.slice(2, -1);
    if (Object.hasOwn(variables, name)) return variables[name];
    if (/^ACCEPTANCE_[A-Z0-9_]+$/.test(name) && env[name] !== undefined)
      return env[name];
    throw new AcceptanceError(
      'SCENARIO_INPUT_MISSING',
      'CONFIGURATION_FAILURE',
    );
  }
  return value;
}
export function resolvePath(path, variables, env) {
  return path.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const value = resolveValue('${' + name + '}', variables, env);
    if (!['string', 'number'].includes(typeof value))
      throw new AcceptanceError(
        'SCENARIO_PATH_SCALAR_REQUIRED',
        'CONFIGURATION_FAILURE',
      );
    return encodeURIComponent(String(value));
  });
}
export async function scenarioChecks(env, sb, report) {
  if (!env.ACCEPTANCE_SCENARIOS_FILE) return;
  const plan = validateScenarios(
    JSON.parse(readFileSync(env.ACCEPTANCE_SCENARIOS_FILE, 'utf8')),
  );
  const variables = {
    orgA: env.ACCEPTANCE_ORG_A_ID,
    orgB: env.ACCEPTANCE_ORG_B_ID,
  };
  for (const c of plan)
    await runCheck(report, c.id, async () => {
      let count = 0;
      for (const s of c.steps) {
        if (s.kind === 'wait') {
          await new Promise((r) => setTimeout(r, s.ms));
          continue;
        }
        const body = resolveValue(s.body, variables, env);
        const path = resolvePath(s.path, variables, env);
        let r;
        if (s.kind === 'rpc')
          r = await sb.rpc(s.actor ?? 'OWNER_A', path, body);
        else if (s.kind === 'rest')
          r = await sb.call('/rest/v1' + path, {
            actor: s.actor ?? 'OWNER_A',
            method: s.method,
            body,
          });
        else {
          const configured = env[s.origin];
          if (!configured)
            throw new AcceptanceError(
              'PROVIDER_CONFIGURATION_MISSING',
              'CONFIGURATION_FAILURE',
            );
          const base = new URL(configured),
            url = new URL(path, base);
          if (
            url.origin !== base.origin ||
            url.protocol !== 'https:' ||
            url.username ||
            url.password
          )
            throw new Error('CROSS_ORIGIN_REQUEST_FORBIDDEN');
          if (s.kind === 'application' && !bareOrigin(configured))
            throw new Error('INVALID_APP_ORIGIN');
          const token =
            s.kind === 'provider'
              ? env[s.origin.replace(/_URL$/, '_TOKEN')]
              : undefined;
          if (s.kind === 'provider' && !token)
            throw new AcceptanceError(
              'PROVIDER_CREDENTIAL_MISSING',
              'CONFIGURATION_FAILURE',
            );
          r = await request(url, {
            method: s.method,
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(body !== undefined
                ? { 'Content-Type': 'application/json' }
                : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
        }
        assert(r.status === s.status, 'SCENARIO_STATUS_MISMATCH', {
          httpStatus: r.status,
        });
        for (const a of s.assert) {
          const v = pointer(r.body, a.pointer),
            expected = resolveValue(a.value, variables, env);
          const ok =
            a.op === 'equals'
              ? isDeepStrictEqual(v, expected)
              : a.op === 'nonempty'
                ? Array.isArray(v)
                  ? v.length > 0
                  : typeof v === 'string' && v.length > 0
                : a.op === 'empty'
                  ? Array.isArray(v) && v.length === 0
                  : a.op === 'contains'
                    ? Array.isArray(v) &&
                      v.some((x) => isDeepStrictEqual(x, expected))
                    : a.op === 'number-at-least'
                      ? typeof v === 'number' && v >= expected
                      : a.op === 'pdf'
                        ? r.text.startsWith('%PDF-') &&
                          r.headers
                            .get('content-type')
                            ?.includes('application/pdf')
                        : false;
          assert(ok, 'SCENARIO_ASSERTION_FAILED');
          count++;
          if (a.op === 'pdf') {
            const doc = await PDFDocument.load(r.buffer);
            assert(doc.getPageCount() > 0, 'PDF_INTEGRITY_FAILED');
          }
        }
        for (const [name, p] of Object.entries(s.capture ?? {})) {
          const v = pointer(r.body, p);
          assert(v !== undefined, 'SCENARIO_CAPTURE_MISSING');
          variables[name] = v;
        }
      }
      return { steps: c.steps.length, assertions: count };
    });
}
