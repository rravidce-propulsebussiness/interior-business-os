import { readFileSync } from 'node:fs';
import { isHostedOrigin } from '../../packages/shared/src/runtime.ts';
import { operatorId } from './release.mjs';

export const identityNames = [
  'PLATFORM_ADMIN',
  'OWNER_A',
  'USER_A',
  'OWNER_B',
  'USER_B',
  'ACCOUNTS',
  'PROJECT_MANAGER',
  'SITE_SUPERVISOR',
  'STORE_MANAGER',
  'WEBSITE_BROCHURE',
];
export const groups = [
  'target',
  'migration',
  'auth',
  'auth-recovery',
  'rls',
  'rbac',
  'entitlements',
  'storage',
  'application',
  'quotation',
  'billing',
  'procurement',
  'inventory',
  'execution',
  'automation',
  'worker',
  'email',
  'email-failure',
  'pdf',
  'reports',
  'website',
  'brochure',
  'dns-tls',
  'performance',
  'monitoring',
  'backup',
  'restore',
  'rollback',
  'deployment',
  'security',
  'browser',
  'cleanup',
];
export function bareOrigin(value) {
  return isHostedOrigin(value);
}
/* Provider URLs may have paths, but cannot carry credentials or capabilities. */
export function providerUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      isHostedOrigin(u.origin)
    );
  } catch {
    return false;
  }
}
const present = (v) => typeof v === 'string' && v.length > 0;
export function preflight(env) {
  const checks = [];
  const check = (name, valid = present, required = true) => {
    const value = env[name];
    checks.push({
      name,
      status: !present(value)
        ? required
          ? 'MISSING'
          : 'NOT REQUIRED'
        : valid(value)
          ? 'AVAILABLE'
          : 'INVALID',
      critical: required,
    });
  };
  check('ACCEPTANCE_ENVIRONMENT', (v) => v === 'staging');
  check('ACCEPTANCE_PROJECT_REF', (v) => /^[a-z]{20}$/.test(v));
  check('ACCEPTANCE_TARGET_FILE');
  check('ACCEPTANCE_TESTER_ID', operatorId);
  check('ACCEPTANCE_RELEASE_OWNER_ID', operatorId);
  check(
    'HOSTED_SUPABASE_URL',
    (v) =>
      bareOrigin(v) &&
      new URL(v).hostname === `${env.ACCEPTANCE_PROJECT_REF}.supabase.co`,
  );
  check(
    'HOSTED_SUPABASE_PUBLISHABLE_KEY',
    (v) => /^sb_publishable_[A-Za-z0-9_-]+$/.test(v) || jwtRole(v) === 'anon',
  );
  check('HOSTED_DATABASE_URL', (v) => {
    try {
      const u = new URL(v);
      return (
        ['postgres:', 'postgresql:'].includes(u.protocol) &&
        !!u.password &&
        u.searchParams.get('sslmode') === 'verify-full' &&
        (u.hostname === `db.${env.ACCEPTANCE_PROJECT_REF}.supabase.co` ||
          (u.hostname.endsWith('.pooler.supabase.com') &&
            decodeURIComponent(u.username) ===
              `postgres.${env.ACCEPTANCE_PROJECT_REF}`))
      );
    } catch {
      return false;
    }
  });
  for (const app of ['PLATFORM_ADMIN', 'BUSINESS_APP', 'WEBSITES'])
    check(`${app}_ORIGIN`, bareOrigin);
  check('ACCEPTANCE_ORG_A_ID', uuid, env.ACCEPTANCE_MODE !== 'provision');
  check(
    'ACCEPTANCE_ORG_B_ID',
    (v) => uuid(v) && v !== env.ACCEPTANCE_ORG_A_ID,
    env.ACCEPTANCE_MODE !== 'provision',
  );
  for (const name of identityNames) {
    check(`ACCEPTANCE_${name}_EMAIL`, (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    );
    check(`ACCEPTANCE_${name}_PASSWORD`, (v) => v.length >= 12);
  }
  check('ACCEPTANCE_SCENARIOS_FILE', present, false);
  check(
    'HOSTED_SUPABASE_SECRET_KEY',
    (v) =>
      /^sb_secret_[A-Za-z0-9_-]+$/.test(v) || jwtRole(v) === 'service_role',
    false,
  );
  for (const name of [
    'ACCEPTANCE_SMTP_CONFIGURED',
    'ACCEPTANCE_INBOX_URL',
    'ACCEPTANCE_INBOX_TOKEN',
    'AUTOMATION_DATABASE_URL',
    'AUTOMATION_EMAIL_API_KEY',
    'AUTOMATION_EMAIL_FROM',
    'ACCEPTANCE_STORAGE_BUCKET',
    'ACCEPTANCE_WORKER_CONTROL_URL',
    'ACCEPTANCE_SCHEDULER_CONFIGURED',
    'ACCEPTANCE_MONITORING_URL',
    'ACCEPTANCE_BACKUP_CONTROL_URL',
    'ACCEPTANCE_DEPLOYMENT_CONTROL_URL',
  ]) {
    const validator =
      name.endsWith('_URL') && name !== 'AUTOMATION_DATABASE_URL'
        ? providerUrl
        : name.endsWith('_CONFIGURED')
          ? (v) => v === 'true'
          : present;
    check(name, validator, false);
  }
  return checks;
}
export function jwtRole(value) {
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role;
  } catch {
    return undefined;
  }
}
export function uuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v ?? '',
  );
}
export function readTarget(env) {
  const target = JSON.parse(readFileSync(env.ACCEPTANCE_TARGET_FILE, 'utf8'));
  const fields = [
    'environment',
    'projectRef',
    'productionProjectRefs',
    'productionOrigins',
    'origins',
    'markerId',
    'releaseSha',
    'releaseCandidate',
    'organizations',
    'roles',
    'performance',
    'providerOrigins',
    'plans',
    'inventoryReviewed',
    'customRoles',
  ];
  if (Object.keys(target).some((k) => !fields.includes(k)))
    throw new Error('UNKNOWN_TARGET_FIELD');
  if (
    target.environment !== 'staging' ||
    target.projectRef !== env.ACCEPTANCE_PROJECT_REF ||
    target.inventoryReviewed !== true ||
    !Array.isArray(target.productionProjectRefs) ||
    target.productionProjectRefs.some((v) => !/^[a-z]{20}$/.test(v)) ||
    !Array.isArray(target.productionOrigins) ||
    target.productionOrigins.some((v) => !bareOrigin(v)) ||
    target.productionProjectRefs.includes(target.projectRef) ||
    target.productionOrigins?.some((v) =>
      [
        env.PLATFORM_ADMIN_ORIGIN,
        env.BUSINESS_APP_ORIGIN,
        env.WEBSITES_ORIGIN,
      ].includes(v),
    )
  )
    throw new Error('TARGET_INVENTORY_MISMATCH');
  for (const name of [
    'PLATFORM_ADMIN_ORIGIN',
    'BUSINESS_APP_ORIGIN',
    'WEBSITES_ORIGIN',
  ])
    if (target.origins?.[name] !== env[name])
      throw new Error('TARGET_ORIGIN_MISMATCH');
  if (
    !uuid(target.markerId) ||
    !target.releaseSha?.match(/^[a-f0-9]{40}$/) ||
    (env.ACCEPTANCE_MODE !== 'provision' &&
      (target.organizations?.A !== env.ACCEPTANCE_ORG_A_ID ||
        target.organizations?.B !== env.ACCEPTANCE_ORG_B_ID))
  )
    throw new Error('TARGET_MARKER_OR_FIXTURE_MISMATCH');
  for (const [name, origin] of Object.entries(target.providerOrigins ?? {})) {
    if (
      !/^ACCEPTANCE_[A-Z_]+_URL$/.test(name) ||
      typeof origin !== 'string' ||
      !providerUrl(origin) ||
      env[name] !== origin
    )
      throw new Error('PROVIDER_ORIGIN_INVENTORY_MISMATCH');
  }
  return target;
}
