import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { manualLine, noDiscount } from '@business-os/quotation-engine';
import { attestQuotation } from './quotation-attestation';
const executable =
  process.env.PSQL_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
    : 'psql');
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'serializes numbering, concurrent edits/issue and revision creation across independent sessions',
  async () => {
    const args = [
      '-X',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      process.env.TEST_DATABASE_URL!,
    ];
    const run = (sql: string) => {
      const r = spawnSync(executable, args, { input: sql, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    const race = (sql: string) =>
      new Promise<{ code: number | null; error: string }>((resolve) => {
        const child = spawn(executable, args, {
          stdio: ['pipe', 'ignore', 'pipe'],
        });
        let error = '';
        child.stderr.on('data', (data) => {
          error += String(data);
        });
        child.on('close', (code) => resolve({ code, error }));
        child.stdin.end(sql);
      });
    const actor = '11111111-1111-4111-8111-111111111111',
      org = randomUUID(),
      customer = randomUUID(),
      project = randomUUID(),
      key = randomBytes(32).toString('hex');
    run(
      `begin;set local request.jwt.claim.sub='${actor}';insert into public.organizations(id,name,slug,default_currency,country_code,created_by,status) values('${org}','Concurrent test','concurrent-${org}','INR','IN','${actor}','active');insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${actor}','active');insert into public.roles(organization_id,key,name,is_owner) values('${org}','owner','Owner',true);insert into public.role_permissions(organization_id,role_id,permission_id) select '${org}',r.id,p.id from public.roles r cross join public.permissions p join private.role_template_permissions t on t.permission_key=p.key and t.role_key='owner' where r.organization_id='${org}';insert into public.membership_roles(organization_id,membership_id,role_id) select '${org}',m.id,r.id from public.organization_memberships m join public.roles r on r.organization_id=m.organization_id where m.organization_id='${org}' and m.user_id='${actor}' and r.key='owner';insert into public.organization_entitlements(organization_id,module_id,enabled,source) select '${org}',id,true,'manual' from public.modules where key in('quotation','projects');insert into public.customers(id,organization_id,display_name) values('${customer}','${org}','Concurrent customer');insert into public.projects(id,organization_id,customer_id,name,code) values('${project}','${org}','${customer}','Concurrent project','concurrent');insert into public.organization_quotation_settings(organization_id,branding) values('${org}','{}');insert into private.quotation_signing_keys(singleton,secret_hex) values(true,'${key}') on conflict(singleton) do update set secret_hex=excluded.secret_hex;commit;`,
    );
    const commit = (payload: Record<string, unknown>) => {
      const proof = attestQuotation(key, actor, org, 'commit', payload);
      return `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';select public.commit_quotation(${quote(proof.p_message)},${quote(proof.p_signature)});commit;`;
    };
    const creates = await Promise.all([
      race(commit({ action: 'create', project_id: project, currency: 'INR' })),
      race(commit({ action: 'create', project_id: project, currency: 'INR' })),
    ]);
    expect(
      creates.map((r) => r.code),
      JSON.stringify(creates),
    ).toEqual([0, 0]);
    expect(
      run(
        `select count(distinct quotation_number) from public.quotations where organization_id='${org}';`,
      ),
    ).toBe('2');
    const revision = run(
      `select id from public.quotation_revisions where organization_id='${org}' order by id limit 1;`,
    );
    const line = manualLine({
      area_id: null,
      sort_order: 0,
      optional: false,
      name: 'Installation',
      description: '',
      quantity: '1',
      unit: 'each',
      rate: '100',
      reason: 'Special installation',
      discount: noDiscount,
      estimated_cost_rate: null,
    });
    run(
      commit({
        action: 'save_line',
        revision_id: revision,
        version: 1,
        line_id: null,
        catalog_item_id: null,
        area_id: null,
        sort_order: 0,
        optional: false,
        description: '',
        ...line,
      }),
    );
    const writes = await Promise.all([
      race(commit({ action: 'issue', revision_id: revision, version: 2 })),
      race(
        commit({
          action: 'edit_revision',
          revision_id: revision,
          version: 2,
          terms: 'Updated',
          customer_notes: '',
          internal_notes: '',
          valid_until: '2026-12-31',
          discount: noDiscount,
        }),
      ),
    ]);
    expect(writes.filter((r) => r.code === 0)).toHaveLength(1);
    expect(writes.find((r) => r.code !== 0)?.error).toContain('Stale revision');
    if (
      run(
        `select status from public.quotation_revisions where id='${revision}';`,
      ) === 'draft'
    )
      run(commit({ action: 'issue', revision_id: revision, version: 3 }));
    const version = Number(
      run(
        `select version from public.quotation_revisions where id='${revision}';`,
      ),
    );
    const clones = await Promise.all([
      race(commit({ action: 'clone', revision_id: revision, version })),
      race(commit({ action: 'clone', revision_id: revision, version })),
    ]);
    expect(clones.filter((r) => r.code === 0)).toHaveLength(1);
    expect(clones.find((r) => r.code !== 0)?.error).toContain(
      'Draft already exists',
    );
    expect(
      run(
        `select count(*) from public.quotation_revisions where quotation_id=(select quotation_id from public.quotation_revisions where id='${revision}') and status='draft';`,
      ),
    ).toBe('1');
  },
  60000,
);
