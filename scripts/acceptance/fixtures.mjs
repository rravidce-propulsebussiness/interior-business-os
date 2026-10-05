import { database, literal, verifyMarker } from './database.mjs';
import { identityNames, uuid } from './config.mjs';
import { assert, AcceptanceError } from './http.mjs';

export function registeredRowsMatch(rows, env, target) {
  return (
    rows.length === 2 &&
    ['A', 'B'].every((side) => {
      const row = rows.find((r) => r.id === env[`ACCEPTANCE_ORG_${side}_ID`]);
      return (
        row &&
        row.marker === target.markerId &&
        row.name.startsWith(`ACCEPTANCE-${side}-`) &&
        row.slug.startsWith(`acceptance-${side.toLowerCase()}-`)
      );
    })
  );
}
export function verifyFixtures(env, target) {
  const rows = JSON.parse(
    database(
      env,
      `select coalesce(json_agg(json_build_object('id',o.id,'name',o.name,'slug',o.slug,'marker',r.marker_id)),'[]') from public.organizations o join acceptance_control.organizations r on r.organization_id=o.id where o.id in (${literal(env.ACCEPTANCE_ORG_A_ID)},${literal(env.ACCEPTANCE_ORG_B_ID)});`,
    ),
  );
  if (!registeredRowsMatch(rows, env, target))
    throw new AcceptanceError(
      'ACCEPTANCE_ORGANIZATIONS_NOT_REGISTERED',
      'CONFIGURATION_FAILURE',
    );
  return rows;
}
export async function provision(env, target, sb) {
  verifyMarker(env, target);
  // Use operator-supplied, genuinely confirmed Auth accounts. No synthetic users
  // or admin-confirmed substitute for verification-email acceptance.
  for (const name of identityNames) await sb.login(name);
  const people = identityNames.map((name) => ({
    name,
    id: sb.sessions.get(name).user.id,
  }));
  assert(
    new Set(people.map((p) => p.id)).size === people.length,
    'DISTINCT_IDENTITIES_REQUIRED',
  );
  const admin = await sb.rpc('PLATFORM_ADMIN', 'platform_context', {});
  assert(
    admin.status === 200 &&
      admin.body?.permissions?.includes('platform.access'),
    'REAL_PLATFORM_ADMIN_REQUIRED',
  );
  for (const person of people.filter(
    (p) => !['PLATFORM_ADMIN', 'OWNER_A', 'OWNER_B'].includes(p.name),
  )) {
    const role = target.roles?.[person.name];
    const custom = target.customRoles?.[person.name];
    const existing =
      database(
        env,
        `select count(*) from private.role_templates where key=${literal(role ?? '')} and not is_owner;`,
      ) === '1';
    const customValid =
      custom &&
      custom.key === role &&
      typeof custom.name === 'string' &&
      custom.name.startsWith('ACCEPTANCE ') &&
      Array.isArray(custom.permissions) &&
      custom.permissions.length > 0 &&
      custom.permissions.every((p) => /^[a-z][a-z0-9_.]+$/.test(p)) &&
      database(
        env,
        `select count(*) from public.permissions where scope='organization' and key in (${custom.permissions.map(literal).join(',')});`,
      ) === String(new Set(custom.permissions).size);
    if (!/^[a-z][a-z0-9_]+$/.test(role ?? '') || (!existing && !customValid))
      throw new AcceptanceError(
        'ROLE_TEMPLATE_MAPPING_MISSING',
        'CONFIGURATION_FAILURE',
      );
  }
  const outsiders = database(
    env,
    `select count(*) from public.organization_memberships m where user_id in (${people
      .filter((p) => p.name !== 'PLATFORM_ADMIN')
      .map((p) => literal(p.id))
      .join(
        ',',
      )}) and not exists(select 1 from acceptance_control.organizations a where a.organization_id=m.organization_id and a.marker_id=${literal(target.markerId)});`,
  );
  if (outsiders !== '0')
    throw new AcceptanceError(
      'TEST_IDENTITY_HAS_UNREGISTERED_MEMBERSHIP',
      'CONFIGURATION_FAILURE',
    );
  verifyMarker(env, target);
  const suffix = Date.now().toString(36);
  const organizations = {};
  for (const side of ['A', 'B']) {
    const owner = people.find((p) => p.name === `OWNER_${side}`);
    // Organization and registry insertion are atomic. The owner identity is real;
    // canonical provisioning still owns permissions, roles and owner invariants.
    const id = database(
      env,
      `select set_config('request.jwt.claim.sub',${literal(owner.id)},true);\nwith created as (select public.create_organization(${literal(JSON.stringify({ name: `ACCEPTANCE-${side}-${suffix}`, slug: `acceptance-${side.toLowerCase()}-${suffix}`, currency: 'INR', country: 'IN', timezone: 'Asia/Kolkata' }))}::jsonb) id) insert into acceptance_control.organizations(organization_id,marker_id) select id,${literal(target.markerId)} from created returning organization_id;`,
      { readOnly: false },
    )
      .split(/\r?\n/)
      .at(-1);
    assert(uuid(id), 'PROVISIONING_ID_INVALID');
    organizations[side] = id;
    if (side === 'A')
      for (const definition of Object.values(target.customRoles ?? {})) {
        const r = await sb.rpc('OWNER_A', 'save_role', {
          p_organization_id: id,
          p_input: definition,
        });
        assert(
          r.status === 200 && uuid(r.body),
          'CUSTOM_ACCEPTANCE_ROLE_PROVISIONING_FAILED',
        );
      }
    for (const person of people.filter(
      (p) =>
        p.name === `USER_${side}` ||
        (side === 'A' &&
          [
            'ACCOUNTS',
            'PROJECT_MANAGER',
            'SITE_SUPERVISOR',
            'STORE_MANAGER',
            'WEBSITE_BROCHURE',
          ].includes(p.name)),
    )) {
      const invite = await sb.rpc(`OWNER_${side}`, 'invite_member', {
        p_organization_id: id,
        p_user_id: person.id,
      });
      assert(
        invite.status === 200 && uuid(invite.body),
        'MEMBERSHIP_PROVISIONING_FAILED',
      );
      const accept = await sb.rpc(person.name, 'accept_membership', {
        p_membership_id: invite.body,
      });
      assert(
        accept.status === 204 || accept.status === 200,
        'MEMBERSHIP_ACCEPT_FAILED',
      );
      // Assign exactly the operator-reviewed existing template key, never invent roles.
      const role = target.roles?.[person.name];
      if (!/^[a-z][a-z0-9_]+$/.test(role ?? ''))
        throw new AcceptanceError(
          'ROLE_TEMPLATE_MAPPING_MISSING',
          'CONFIGURATION_FAILURE',
        );
      const roles = await sb.call(
        `/rest/v1/roles?select=id&organization_id=eq.${id}&key=eq.${role}`,
        { actor: `OWNER_${side}` },
      );
      assert(
        roles.status === 200 && roles.body?.length === 1,
        'ROLE_TEMPLATE_NOT_FOUND',
      );
      const assigned = await sb.rpc(`OWNER_${side}`, 'set_member_role', {
        p_organization_id: id,
        p_membership_id: invite.body,
        p_role_id: roles.body[0].id,
      });
      assert([200, 204].includes(assigned.status), 'ROLE_ASSIGNMENT_FAILED');
    }
  }
  return organizations;
}
export async function archive(env, target, sb) {
  verifyMarker(env, target);
  verifyFixtures(env, target);
  await sb.login('PLATFORM_ADMIN');
  for (const org of [env.ACCEPTANCE_ORG_A_ID, env.ACCEPTANCE_ORG_B_ID]) {
    const r = await sb.rpc('PLATFORM_ADMIN', 'platform_set_organization', {
      p_organization_id: org,
      p_status: 'suspended',
      p_plan_id: null,
    });
    assert([200, 204].includes(r.status), 'ARCHIVE_FAILED');
  }
  // Financial ledgers, audit and published history deliberately have no destructive
  // purge API. Keep their constraints/triggers. Reset a disposable project by a
  // verified provider restore; do not disable security to manufacture cleanup.
  return { organizationsArchived: 2 };
}
