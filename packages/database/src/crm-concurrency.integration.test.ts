import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { manualLine, noDiscount } from '@business-os/quotation-engine';
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'serializes conversion, numbering, stale edits, completion and public approval races',
  async () => {
    const executable =
      process.env.PSQL_PATH ??
      (process.platform === 'win32'
        ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
        : 'psql');
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
      new Promise<{ code: number | null; error: string }>((resolve, reject) => {
        const child = spawn(executable, args, {
          stdio: ['pipe', 'ignore', 'pipe'],
        });
        let error = '';
        child.stderr.on('data', (v) => (error += String(v)));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, error }));
        child.stdin.end(sql);
      });
    const actor = '11111111-1111-4111-8111-111111111111',
      org = randomUUID(),
      source = randomUUID(),
      stage = randomUUID(),
      lead = randomUUID(),
      customer = randomUUID(),
      project = randomUUID();
    const auth = (sql: string) =>
      `begin;set local request.jwt.claim.sub='${actor}';set local role authenticated;${sql};commit;`;
    const anon = (sql: string) => `begin;set local role anon;${sql};commit;`;
    const data = manualLine({
      name: 'Concurrent work',
      description: '',
      area_id: null,
      optional: false,
      sort_order: 0,
      quantity: '1',
      unit: 'each',
      rate: '100',
      reason: 'Manual estimate',
      discount: noDiscount,
      estimated_cost_rate: null,
    });
    run(
      `begin;set local request.jwt.claim.sub='${actor}';insert into public.organizations(id,name,slug,default_currency,country_code,created_by,status) values('${org}','CRM concurrency','crm-${org}','INR','IN','${actor}','active');insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${actor}','active');insert into public.roles(organization_id,key,name,is_owner) values('${org}','owner','Owner',true);insert into public.role_permissions(organization_id,role_id,permission_id) select '${org}',r.id,p.id from public.roles r cross join public.permissions p join private.role_template_permissions t on t.permission_key=p.key and t.role_key='owner' where r.organization_id='${org}';insert into public.membership_roles(organization_id,membership_id,role_id) select '${org}',m.id,r.id from public.organization_memberships m join public.roles r on r.organization_id=m.organization_id where m.organization_id='${org}' and r.key='owner';insert into public.organization_entitlements(organization_id,module_id,enabled,source) select '${org}',id,true,'manual' from public.modules where key in ('crm','quotation','projects');insert into public.lead_sources(id,organization_id,name,key) values('${source}','${org}','Referral','referral');insert into public.crm_pipeline_stages(id,organization_id,name,key) values('${stage}','${org}','New','new');insert into public.leads(id,organization_id,lead_number,name,phone,source_id,stage_id) values('${lead}','${org}','FIXTURE','Race lead','+12025550147','${source}','${stage}');insert into public.customers(id,organization_id,display_name) values('${customer}','${org}','Existing customer');insert into public.projects(id,organization_id,customer_id,name,code) values('${project}','${org}','${customer}','Existing project','existing');commit;`,
    );
    const convert = auth(
      `select public.crm_convert('${org}','{"id":"${lead}","version":1}')`,
    );
    const converted = await Promise.all([race(convert), race(convert)]);
    expect(
      converted.map((r) => r.code),
      JSON.stringify(converted),
    ).toEqual([0, 0]);
    expect(
      run(
        `select count(*) from public.lead_activities where lead_id='${lead}' and activity_type='conversion'`,
      ),
    ).toBe('1');
    expect(
      run(
        `select count(*) from public.customers where organization_id='${org}'`,
      ),
    ).toBe('2');
    const create = auth(
      `select public.crm_save('${org}','leads','{"name":"Number race","phone":"+12025550148","source_id":"${source}","stage_id":"${stage}"}')`,
    );
    const created = await Promise.all([race(create), race(create)]);
    expect(created.map((r) => r.code)).toEqual([0, 0]);
    expect(
      run(
        `select count(distinct lead_number) from public.leads where organization_id='${org}' and name='Number race'`,
      ),
    ).toBe('2');
    const edits = await Promise.all([
      race(
        auth(
          `select public.crm_command('${org}','assign','{"id":"${lead}","version":2,"assigned_to":"${actor}"}')`,
        ),
      ),
      race(
        auth(
          `select public.crm_command('${org}','stage','{"id":"${lead}","version":2,"stage_id":"${stage}"}')`,
        ),
      ),
    ]);
    expect(edits.filter((r) => r.code === 0)).toHaveLength(1);
    const followup = randomUUID();
    run(
      `insert into public.lead_followups(id,organization_id,lead_id,assigned_to,due_at,followup_type) values('${followup}','${org}','${lead}','${actor}',now(),'call')`,
    );
    const complete = auth(
      `select public.crm_command('${org}','followup','{"id":"${followup}","version":1,"status":"completed"}')`,
    );
    expect(
      (await Promise.all([race(complete), race(complete)])).map((r) => r.code),
    ).toEqual([0, 0]);
    expect(
      run(`select version from public.lead_followups where id='${followup}'`),
    ).toBe('2');
    for (const mode of ['double', 'revoke', 'supersede'] as const) {
      const root = randomUUID(),
        revision = randomUUID(),
        next = randomUUID();
      run(
        `begin;set local request.jwt.claim.sub='${actor}';insert into public.quotations(id,organization_id,customer_id,project_id,quotation_number) values('${root}','${org}','${customer}','${project}','RACE-${mode}');insert into public.quotation_revisions(id,organization_id,quotation_id,project_id,revision_number,currency,valid_until,document_snapshot) select '${revision}','${org}','${root}','${project}',1,'INR',current_date+30,jsonb_build_object('branding',branding,'customer',jsonb_build_object('name','Customer','legal_name','','phone','','email','','tax_identifier','','billing_address','{"line1":"","line2":"","city":"","region":"","postal_code":"","country_code":""}'::jsonb),'project',jsonb_build_object('name','Project','code','P','site_address','{"line1":"","line2":"","city":"","region":"","postal_code":"","country_code":""}'::jsonb),'display',jsonb_build_object('quantity',true,'unit_rate',true,'specifications',true)) from public.organization_quotation_settings where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';insert into public.quotation_items(organization_id,revision_id,project_id,snapshot) values('${org}','${revision}','${project}',${literal(JSON.stringify(data.snapshot))}::jsonb);update public.quotation_revisions set status='issued',issued_at=now(),totals=private.quotation_totals(id,discount) where id='${revision}';update public.quotations set status='issued',current_revision_id='${revision}' where id='${root}';commit;`,
      );
      const line = run(
        auth(
          `select public.quotation_share_manage('${org}','create','{"revision_id":"${revision}"}')`,
        ),
      )
        .split(/\r?\n/)
        .find((v) => v.startsWith('{'))!;
      const share = JSON.parse(line) as { id: string; token: string };
      const hash = share.token;
      const approve = anon(
        `select public.public_quotation('${hash}','respond','{"action":"approved","name":"Customer","comment":"Proceed","acknowledged":true}')`,
      );
      let other = approve;
      if (mode === 'revoke')
        other = auth(
          `select public.quotation_share_manage('${org}','revoke','{"id":"${share.id}"}')`,
        );
      if (mode === 'supersede') {
        run(
          `begin;set local request.jwt.claim.sub='${actor}';insert into public.quotation_revisions(id,organization_id,quotation_id,project_id,revision_number,currency,valid_until,document_snapshot) select '${next}',organization_id,quotation_id,project_id,2,currency,valid_until,document_snapshot from public.quotation_revisions where id='${revision}';insert into public.quotation_items(organization_id,revision_id,project_id,snapshot) values('${org}','${next}','${project}',${literal(JSON.stringify(data.snapshot))}::jsonb);commit;`,
        );
        // Use the actual Phase 3 issuer, obtaining a current test attestation under the key lock.
        other = `begin;set local request.jwt.claim.sub='${actor}';select 1 from private.quotation_signing_keys for update;do $$declare msg text;key text;begin select secret_hex into key from private.quotation_signing_keys where singleton;if key is null then key=encode(extensions.gen_random_bytes(32),'hex');insert into private.quotation_signing_keys values(true,key);end if;msg=jsonb_build_object('operation','commit','actor','${actor}','organization_id','${org}','nonce',gen_random_uuid(),'expires',floor(extract(epoch from now()))+90,'action','issue','revision_id','${next}','version',1)::text;perform public.commit_quotation(msg,encode(extensions.hmac(convert_to(msg,'UTF8'),decode(key,'hex'),'sha256'),'hex'));end$$;commit;`;
      }
      const results = await Promise.all([race(approve), race(other)]);
      expect(results[1]?.code, JSON.stringify(results)).toBe(0);
      if (mode === 'double') expect(results[0]?.code).toBe(0);
      else expect([0, 3]).toContain(results[0]?.code);
      const count = Number(
        run(
          `select count(*) from public.quotation_customer_responses where revision_id='${revision}'`,
        ),
      );
      expect(count).toBe(results[0]?.code === 0 ? 1 : 0);
      if (mode === 'supersede')
        expect(
          run(
            `select status from public.quotation_revisions where id='${revision}'`,
          ),
        ).toBe('superseded');
    }
  },
  60000,
);
