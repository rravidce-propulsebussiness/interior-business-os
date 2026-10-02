import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  catalogSchema,
  catalogLine,
  noDiscount,
} from '@business-os/quotation-engine';
import { attestQuotation } from './quotation-attestation';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'retains issued Wardrobe pricing and specifications across catalog changes, cloning and explicit refresh',
  () => {
    const organization = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      actor = '11111111-1111-4111-8111-111111111111',
      key = randomBytes(32).toString('hex');
    const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    const run = (sql: string) => {
      const r = spawnSync(
        process.env.PSQL_PATH ??
          (process.platform === 'win32'
            ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
            : 'psql'),
        [
          '-X',
          '-At',
          '-v',
          'ON_ERROR_STOP=1',
          '-d',
          process.env.TEST_DATABASE_URL!,
        ],
        { input: sql, encoding: 'utf8' },
      );
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout;
    };
    const catalog = catalogSchema.parse(
      JSON.parse(
        run(
          `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';select public.catalog_snapshot('${organization}',true);rollback;`,
        )
          .split(/\r?\n/)
          .find((s) => s.startsWith('{'))!,
      ),
    );
    const item = catalog.items.find((i) => i.key === 'wardrobe')!;
    const input = {
      area_id: null,
      sort_order: 0,
      optional: false,
      description: 'Wardrobe finished work',
      discount: noDiscount,
      override: null,
      pricing: {
        organization_id: organization,
        item_id: item.id,
        price_book_id: null,
        branch_id: null,
        currency: 'INR',
        at: '2026-09-29T00:00:00Z',
        measurements: { width: '8', height: '7' },
        answers: {
          grade: 'bwp',
          finish: 'pu',
          hardware: 'hettich',
          shutter: 'hinged',
          pu_finish: 'matte',
        },
      },
    };
    const first = catalogLine(catalog, input);
    expect(first.snapshot.final_amount).toBe('133280');
    const changed = structuredClone(catalog),
      rate = changed.rates.find(
        (r) => r.item_id === item.id && r.price_book_id === null,
      )!;
    rate.base_rate = '1650';
    rate.version++;
    changed.items.find((i) => i.id === item.id)!.name = 'Renamed wardrobe';
    const second = catalogLine(changed, input);
    expect(second.snapshot.final_amount).toBe('138880');
    const proof = attestQuotation(key, actor, organization, 'pricing_context', {
      item_id: item.id,
      branch_id: null,
    });
    run(`begin;set local request.jwt.claim.sub='${actor}';insert into private.quotation_signing_keys(singleton,secret_hex) values(true,'${key}') on conflict(singleton) do update set secret_hex=excluded.secret_hex;
set local role authenticated;select public.quotation_calculation_context(${quote(proof.p_message)},${quote(proof.p_signature)});reset role;
create function pg_temp.history_commit(payload jsonb) returns uuid language plpgsql as $$declare msg text;begin msg=(payload||jsonb_build_object('operation','commit','actor','${actor}','organization_id','${organization}','nonce',gen_random_uuid(),'expires',floor(extract(epoch from now()))+90))::text;return public.commit_quotation(msg,encode(extensions.hmac(convert_to(msg,'UTF8'),decode('${key}','hex'),'sha256'),'hex'));end$$;
do $$declare r uuid;n uuid;line uuid;payload jsonb;begin
 r=pg_temp.history_commit(jsonb_build_object('action','create','project_id',private.seed_uuid('business-os:demo:3bhk'),'currency','INR'));
 payload=jsonb_build_object('action','save_line','revision_id',r,'version',1,'catalog_item_id','${item.id}','area_id',null,'sort_order',0,'optional',false,'description','Wardrobe','snapshot',${quote(JSON.stringify(first.snapshot))}::jsonb,'cost',${quote(JSON.stringify(first.cost))}::jsonb,'fingerprint',md5(private.quotation_catalog_data('${organization}','${item.id}',null)::text));
 perform pg_temp.history_commit(payload);perform pg_temp.history_commit(jsonb_build_object('action','issue','revision_id',r,'version',2));
 update public.price_book_items set base_rate='1650',version=version+1 where id='${rate.id}';update public.catalog_items set name='Renamed wardrobe' where id='${item.id}';
 if (select snapshot->>'final_amount' from public.quotation_items where revision_id=r)<>'133280' then raise exception 'Issued price changed';end if;
 n=pg_temp.history_commit(jsonb_build_object('action','clone','revision_id',r,'version',3));
 select id into line from public.quotation_items where revision_id=n;
 if (select snapshot from public.quotation_items where id=line) is distinct from ${quote(JSON.stringify(first.snapshot))}::jsonb then raise exception 'Clone changed historical snapshot';end if;
 payload=payload||jsonb_build_object('revision_id',n,'version',1,'line_id',line,'snapshot',${quote(JSON.stringify(second.snapshot))}::jsonb,'cost',${quote(JSON.stringify(second.cost))}::jsonb);
 begin perform pg_temp.history_commit(payload);raise exception 'Stale catalog fingerprint accepted';exception when serialization_failure then null;end;
 payload=payload||jsonb_build_object('fingerprint',md5(private.quotation_catalog_data('${organization}','${item.id}',null)::text));perform pg_temp.history_commit(payload);
 perform pg_temp.history_commit(jsonb_build_object('action','issue','revision_id',n,'version',2));
 if (select snapshot->>'final_amount' from public.quotation_items where revision_id=r)<>'133280' or (select snapshot->>'final_amount' from public.quotation_items where revision_id=n)<>'138880' then raise exception 'Historical totals not retained';end if;
 if (select snapshot->>'name' from public.quotation_items where revision_id=r)<>'Wardrobe' or (select snapshot->>'name' from public.quotation_items where revision_id=n)<>'Renamed wardrobe' then raise exception 'Historical labels not retained';end if;
 if (select status from public.quotation_revisions where id=r)<>'superseded' then raise exception 'Earlier issue not superseded';end if;
end$$;rollback;`);
  },
  30000,
);
