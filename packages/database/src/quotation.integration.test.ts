import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { manualLine, noDiscount } from '@business-os/quotation-engine';
import { attestQuotation } from './quotation-attestation';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'enforces attested quotation lifecycle, replay protection and frozen snapshots in PostgreSQL',
  () => {
    const org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const actor = '11111111-1111-4111-8111-111111111111';
    const project = 'a0000000-0000-4000-8000-000000000001';
    const customer = 'a0000000-0000-4000-8000-000000000002';
    const key = randomBytes(32).toString('hex');
    const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    const signed = (payload: Record<string, unknown>) => {
      const a = attestQuotation(key, actor, org, 'commit', payload);
      return `public.commit_quotation(${literal(a.p_message)},${literal(a.p_signature)})`;
    };
    // The revision UUID is generated inside SQL. Sign its envelope in SQL using
    // the same HMAC protocol; the separate create call exercises the Node signer.
    const { snapshot, cost } = manualLine({
      area_id: null,
      sort_order: 0,
      optional: false,
      name: 'Installation',
      description: '',
      quantity: '2',
      unit: 'each',
      rate: '100',
      reason: 'Special installation',
      discount: noDiscount,
      estimated_cost_rate: '30',
    });
    const create = signed({
      action: 'create',
      project_id: project,
      currency: 'INR',
    });
    const sql = `begin;
insert into private.quotation_signing_keys(singleton,secret_hex) values(true,${literal(key)}) on conflict(singleton) do update set secret_hex=excluded.secret_hex;
create function pg_temp.commit_test(payload jsonb) returns uuid language plpgsql as $$ declare msg text;begin msg=(payload||jsonb_build_object('operation','commit','actor','${actor}','organization_id','${org}','nonce',gen_random_uuid(),'expires',floor(extract(epoch from now()))+90))::text;return public.commit_quotation(msg,encode(extensions.hmac(convert_to(msg,'UTF8'),decode('${key}','hex'),'sha256'),'hex'));end $$;
set local request.jwt.claim.sub='${actor}';
insert into public.customers(id,organization_id,display_name) values('${customer}','${org}','Ravi');
insert into public.projects(id,organization_id,customer_id,name,code) values('${project}','${org}','${customer}','Apartment','quote-test');
insert into public.organization_quotation_settings(organization_id,branding,default_terms) values('${org}','{"name":"Studio"}','Original terms') on conflict(organization_id) do nothing;
set local role authenticated;
select ${create};
reset role;
do $$ declare r uuid;v integer;n uuid;before_snapshot jsonb;begin
 select id into r from public.quotation_revisions where project_id='${project}';
 perform pg_temp.commit_test(jsonb_build_object('action','save_line','revision_id',r,'version',1,'catalog_item_id',null,'area_id',null,'sort_order',0,'optional',false,'description','','snapshot',${literal(JSON.stringify(snapshot))}::jsonb,'cost',${literal(JSON.stringify(cost))}::jsonb));
 if (select totals->>'final_amount' from public.quotation_revisions where id=r)<>'200' then raise exception 'wrong totals';end if;
 begin perform pg_temp.commit_test(jsonb_build_object('action','issue','revision_id',r,'version',1));raise exception 'stale accepted';exception when serialization_failure then null;end;
 perform pg_temp.commit_test(jsonb_build_object('action','issue','revision_id',r,'version',2));
 select snapshot into before_snapshot from public.quotation_items where revision_id=r;
 begin update public.quotation_items set description='tampered' where revision_id=r;raise exception 'frozen line accepted';exception when check_violation then null;end;
 begin update public.quotation_revisions set terms='tampered' where id=r;raise exception 'frozen header accepted';exception when check_violation then null;end;
 n=pg_temp.commit_test(jsonb_build_object('action','clone','revision_id',r,'version',3));
 if (select snapshot from public.quotation_items where revision_id=n) is distinct from before_snapshot then raise exception 'clone changed snapshot';end if;
 if (select cost_snapshot->>'estimatedCost' from public.quotation_item_costs c join public.quotation_items i on i.id=c.item_id where i.revision_id=n)<>'60' then raise exception 'clone lost cost';end if;
 perform pg_temp.commit_test(jsonb_build_object('action','issue','revision_id',n,'version',1));
 if (select status from public.quotation_revisions where id=r)<>'superseded' then raise exception 'prior revision not superseded';end if;
 begin perform ${create};raise exception 'replay accepted';exception when unique_violation then null;end;
end $$;
rollback;`;
    const result = spawnSync(
      process.env.PSQL_PATH ??
        (process.platform === 'win32'
          ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
          : 'psql'),
      ['-X', '-v', 'ON_ERROR_STOP=1', '-d', process.env.TEST_DATABASE_URL!],
      { input: sql, encoding: 'utf8' },
    );
    expect(result.stderr, result.stderr).not.toContain('ERROR:');
    expect(result.status, result.stderr).toBe(0);
  },
  30000,
);
