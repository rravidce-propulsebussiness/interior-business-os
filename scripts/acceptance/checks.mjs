import { randomUUID } from 'node:crypto';
import { identityNames } from './config.mjs';
import { assert, AcceptanceError } from './http.mjs';
import { probeService } from '../production-smoke.mjs';

export async function runCheck(report, id, fn) {
  try {
    const evidence = await fn();
    report.add(id, 'PASS', 'NONE', 'EXPECTED_RESULT_OBSERVED', evidence ?? {});
    return true;
  } catch (e) {
    report.add(
      id,
      e.category === 'CONFIGURATION_FAILURE' ||
        e.category === 'EXTERNAL_DEPENDENCY' ||
        e.category === 'ENVIRONMENT_LIMITATION'
        ? 'BLOCKED'
        : 'FAIL',
      e.category ?? 'CODE_FAILURE',
      e instanceof AcceptanceError ? e.message : 'CHECK_FAILED',
      e.evidence ?? {},
    );
    return false;
  }
}
export async function probes(env, report) {
  let ready = true;
  for (const service of ['PLATFORM_ADMIN', 'BUSINESS_APP', 'WEBSITES']) {
    ready =
      (await runCheck(
        report,
        `application.${service.toLowerCase()}`,
        async () => {
          for (const row of await probeService(env[`${service}_ORIGIN`])) {
            if (row.errorCode)
              throw new AcceptanceError(
                'REMOTE_REQUEST_FAILED',
                'EXTERNAL_DEPENDENCY',
              );
            assert(row.ok, 'APPLICATION_OR_SECURITY_PROBE_FAILED', {
              httpStatus: row.status,
            });
          }
          return { requests: 3 };
        },
      )) && ready;
  }
  return ready;
}
export async function authChecks(sb, report) {
  let ready = true;
  for (const actor of identityNames)
    ready =
      (await runCheck(report, `auth.login.${actor.toLowerCase()}`, async () => {
        const s = await sb.login(actor);
        return { httpStatus: 200, userId: s.user.id };
      })) && ready;
  if (!ready) return false;
  await runCheck(report, 'auth.invalid-password', async () => {
    const r = await sb.call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: sb.env.ACCEPTANCE_OWNER_A_EMAIL,
        password: randomUUID() + randomUUID(),
      },
    });
    assert(
      [400, 401].includes(r.status) &&
        r.body?.error_code === 'invalid_credentials',
      'INVALID_PASSWORD_NOT_DENIED',
      { httpStatus: r.status },
    );
    return { httpStatus: r.status };
  });
  await runCheck(report, 'auth.refresh', async () => {
    const old = sb.sessions.get('OWNER_A');
    const r = await sb.call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: old.refresh_token },
    });
    assert(
      r.status === 200 &&
        r.body?.user?.id === old.user.id &&
        !!r.body?.access_token &&
        !!r.body?.refresh_token,
      'REFRESH_FAILED',
      { httpStatus: r.status },
    );
    sb.sessions.set('OWNER_A', r.body);
    return { httpStatus: r.status, userId: r.body.user.id };
  });
  await runCheck(report, 'auth.platform-separation', async () => {
    const admin = await sb.rpc('PLATFORM_ADMIN', 'platform_context', {});
    const owner = await sb.rpc('OWNER_A', 'platform_context', {});
    assert(
      admin.status === 200 &&
        admin.body?.permissions?.includes('platform.access') &&
        owner.status === 200 &&
        !owner.body?.permissions?.includes('platform.access'),
      'PLATFORM_PERMISSION_BOUNDARY_FAILED',
    );
    return { assertions: 2 };
  });
  await runCheck(report, 'auth.logout', async () => {
    const session = sb.sessions.get('OWNER_B');
    const r = await sb.call('/auth/v1/logout?scope=local', {
      actor: 'OWNER_B',
      method: 'POST',
    });
    assert(r.status === 204, 'LOGOUT_FAILED', { httpStatus: r.status });
    sb.sessions.delete('OWNER_B');
    const refresh = await sb.call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    assert(
      refresh.status === 400 &&
        ['refresh_token_not_found', 'refresh_token_already_used'].includes(
          refresh.body?.error_code,
        ),
      'LOGGED_OUT_REFRESH_NOT_DENIED',
      { httpStatus: refresh.status },
    );
    await sb.login('OWNER_B');
    return { assertions: 2 };
  });
  return true;
}
// Each foreign read first proves that the owner can see a fixture row.
// Empty tables are BLOCKED: an empty cross-tenant read alone is not evidence.
export const tenantTables = [
  'customers',
  'projects',
  'quotations',
  'quotation_revisions',
  'invoices',
  'payments',
  'purchase_requisitions',
  'purchase_orders',
  'goods_receipts',
  'inventory_movements',
  'execution_plans',
  'project_tasks',
  'websites',
  'brochures',
  'automation_rules',
  'automation_executions',
  'notifications',
  'report_snapshots',
];
export async function isolation(sb, report) {
  const orgA = sb.env.ACCEPTANCE_ORG_A_ID,
    orgB = sb.env.ACCEPTANCE_ORG_B_ID;
  for (const table of tenantTables)
    await runCheck(report, `rls.${table}`, async () => {
      const path = `/rest/v1/${table}?select=id&organization_id=eq.${orgB}&limit=1`;
      const own = await sb.call(path, { actor: 'OWNER_B' });
      assert(
        own.status === 200 && Array.isArray(own.body),
        'OWNER_FIXTURE_READ_FAILED',
        { httpStatus: own.status },
      );
      if (!own.body.length)
        throw new AcceptanceError(
          'TENANT_FIXTURE_MISSING',
          'CONFIGURATION_FAILURE',
        );
      const foreign = await sb.call(
        `/rest/v1/${table}?select=id&id=eq.${own.body[0].id}`,
        { actor: 'OWNER_A' },
      );
      assert(
        foreign.status === 200 &&
          Array.isArray(foreign.body) &&
          foreign.body.length === 0,
        'FOREIGN_ROW_READ_NOT_DENIED',
        { httpStatus: foreign.status },
      );
      return { assertions: 2, httpStatus: foreign.status };
    });
  for (const [actor, own, other] of [
    ['OWNER_A', orgA, orgB],
    ['OWNER_B', orgB, orgA],
  ])
    await runCheck(report, `rls.context.${actor.toLowerCase()}`, async () => {
      const allowed = await sb.rpc(actor, 'organization_context', {
        p_organization_id: own,
      });
      const denied = await sb.rpc(actor, 'organization_context', {
        p_organization_id: other,
      });
      assert(
        allowed.status === 200 && allowed.body?.organizationId === own,
        'OWN_ORGANIZATION_CONTEXT_FAILED',
      );
      assert(
        denied.status === 403 && denied.body?.code === '42501',
        'FOREIGN_ORGANIZATION_RPC_NOT_DENIED',
        { httpStatus: denied.status },
      );
      return { assertions: 2 };
    });
  for (const actor of [
    'USER_A',
    'USER_B',
    'ACCOUNTS',
    'PROJECT_MANAGER',
    'SITE_SUPERVISOR',
    'STORE_MANAGER',
    'WEBSITE_BROCHURE',
  ])
    await runCheck(
      report,
      `rbac.${actor.toLowerCase()}.platform-denial`,
      async () => {
        const r = await sb.rpc(actor, 'platform_set_entitlement', {
          p_organization_id: orgA,
          p_input: { moduleKey: 'website', enabled: true, source: 'manual' },
        });
        assert(
          r.status === 403 && r.body?.code === '42501',
          'STAFF_PLATFORM_WRITE_NOT_DENIED',
          { httpStatus: r.status },
        );
        return { httpStatus: r.status };
      },
    );
}
