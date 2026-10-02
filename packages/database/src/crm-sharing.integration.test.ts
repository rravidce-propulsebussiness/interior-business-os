import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { manualLine, noDiscount } from '@business-os/quotation-engine';
import {
  customerDocumentSchema,
  renderQuotationDocument,
} from '../../core/src/quotation-document';
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'authorizes exact public revisions, immutable responses, expiry, rotation and customer-only projections',
  () => {
    const org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      actor = '11111111-1111-4111-8111-111111111111',
      key = randomBytes(32).toString('hex');
    const { snapshot, cost } = manualLine({
      name: 'Private-project installation',
      description: '',
      area_id: null,
      sort_order: 0,
      optional: false,
      quantity: '2',
      unit: 'each',
      rate: '100',
      reason: 'Internal override reason',
      discount: noDiscount,
      estimated_cost_rate: '30',
    });
    const sql = `begin;
insert into private.quotation_signing_keys(singleton,secret_hex) values(true,'${key}') on conflict(singleton) do update set secret_hex=excluded.secret_hex;
set local request.jwt.claim.sub='${actor}';
create function pg_temp.commit_quote(payload jsonb) returns uuid language plpgsql security definer as $$declare msg text;begin msg=(payload||jsonb_build_object('operation','commit','actor','${actor}','organization_id','${org}','nonce',gen_random_uuid(),'expires',floor(extract(epoch from now()))+90))::text;return public.commit_quotation(msg,encode(extensions.hmac(convert_to(msg,'UTF8'),decode('${key}','hex'),'sha256'),'hex'));end$$;
create function pg_temp.assert_value(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$begin begin execute statement;exception when insufficient_privilege or check_violation or invalid_parameter_value or serialization_failure then raise notice 'PASS: %',label;return;end;raise exception 'FAIL: %',label;end$$;
create temp table share_test_state(payload jsonb);grant select,insert on share_test_state to authenticated,anon;
set local role authenticated;
do $$declare lead uuid;mapping jsonb;r uuid;n uuid;expired_revision uuid;link jsonb;rotated jsonb;hash text;oldhash text;payload jsonb;response jsonb;begin
 lead=public.crm_save('${org}','leads',jsonb_build_object('name','Sharing lead','phone','+49 30 123456','source_id',(select id from public.lead_sources where organization_id='${org}' and key='referral'),'stage_id',(select id from public.crm_pipeline_stages where organization_id='${org}' and key='new')));
 mapping=public.crm_convert('${org}',jsonb_build_object('id',lead,'version',1));
 r=pg_temp.commit_quote(jsonb_build_object('action','create','project_id',mapping->>'project_id','currency','INR'));
 perform pg_temp.denied(format('select public.quotation_share_manage(%L,''create'',%L::jsonb)','${org}',jsonb_build_object('revision_id',r)),'draft cannot be shared');
 perform pg_temp.commit_quote(jsonb_build_object('action','save_line','revision_id',r,'version',1,'catalog_item_id',null,'area_id',null,'optional',false,'sort_order',0,'description','Customer description','snapshot',${literal(JSON.stringify(snapshot))}::jsonb,'cost',${literal(JSON.stringify(cost))}::jsonb));
 perform pg_temp.commit_quote(jsonb_build_object('action','issue','revision_id',r,'version',2));
 perform pg_temp.assert_value((select lifecycle='open' from public.leads where id=lead),'issue does not mark Won');
 link=public.quotation_share_manage('${org}','create',jsonb_build_object('revision_id',r));
 perform pg_temp.assert_value(length(link->>'token')=64,'256-bit token encoding');
 hash=link->>'token';oldhash=hash;
 perform pg_temp.denied(format('select public.public_quotation(%L)',encode(sha256(convert_to(hash,'UTF8')),'hex')),'stored hash is not a bearer credential');
 payload=public.public_quotation(hash);
 perform pg_temp.assert_value(payload->'document'->'totals'->>'final_amount'='200','exact public amount');
 perform pg_temp.assert_value(public.public_quotation(hash,'pdf')->'document'=payload->'document','public PDF uses the exact customer projection');
 perform pg_temp.denied(format('select public.public_quotation(%L,''respond'',%L::jsonb)',hash,jsonb_build_object('action','approved','name','Ravi','acknowledged',true,'revision_id',gen_random_uuid())),'customer cannot choose a different revision');
 perform pg_temp.assert_value(payload::text!~ 'estimatedCost|minimum_amount|internal_notes|override|fingerprint|created_by|organization_id|revision_id|lineage_id|Internal override reason','public payload excludes internal fields');
 insert into share_test_state values(jsonb_build_object('hash',hash,'document',payload->'document','revision',r,'lead',lead));
 perform public.public_quotation(hash);
 perform pg_temp.assert_value((select view_count=2 and first_viewed_at is not null from public.quotation_share_links where id=(link->>'id')::uuid),'view aggregation');
 perform pg_temp.assert_value((select count(*)=1 from public.lead_activities where lead_id=lead and activity_type='customer_viewed'),'first view event only');
 perform pg_temp.denied(format('select public.public_quotation(%L,''respond'',%L::jsonb)',hash,jsonb_build_object('action','approved','name','Ravi','acknowledged',true,'amount','1')),'customer cannot supply amount');
 response=public.public_quotation(hash,'respond','{"action":"changes_requested","name":"Ravi","comment":"Use a different finish","acknowledged":true}');
 perform pg_temp.assert_value(response->>'action'='changes_requested','change request recorded');
 perform pg_temp.assert_value((select status='issued' and totals->>'final_amount'='200' from public.quotation_revisions where id=r),'response does not mutate issued revision');
 perform pg_temp.denied(format('select public.public_quotation(%L,''respond'',''{"action":"approved","name":"Ravi","acknowledged":true}'')',hash),'conflicting response denied');
 n=pg_temp.commit_quote(jsonb_build_object('action','clone','revision_id',r,'version',3));
 perform pg_temp.commit_quote(jsonb_build_object('action','issue','revision_id',n,'version',1));
 payload=public.public_quotation(hash);
 perform pg_temp.assert_value(payload->'document'->>'status'='superseded' and payload->'document'->>'revision'='1' and not (payload->>'can_respond')::boolean,'old link remains exact historical revision');
 perform pg_temp.denied(format('select public.public_quotation(%L,''respond'',''{"action":"approved","name":"Ravi","acknowledged":true}'')',hash),'superseded cannot approve');
 link=public.quotation_share_manage('${org}','create',jsonb_build_object('revision_id',n));hash=link->>'token';
 response=public.public_quotation(hash,'respond','{"action":"approved","name":"Ravi","comment":"Proceed","acknowledged":true}');
 perform pg_temp.assert_value(response=public.public_quotation(hash,'respond','{"action":"approved","name":"Ravi","comment":"Proceed","acknowledged":true}'),'duplicate approval is idempotent');
 perform pg_temp.assert_value((select accepted_amount='200' from public.quotation_customer_responses where revision_id=n),'accepted amount comes from frozen snapshot');
 perform pg_temp.assert_value((select count(*)=2 from public.lead_activities where lead_id=lead and activity_type='customer_response'),'automatic response timeline');
 rotated=public.quotation_share_manage('${org}','rotate',jsonb_build_object('id',link->>'id','pdf_enabled',false));
 perform pg_temp.assert_value(rotated->>'token'<>link->>'token','rotation creates fresh token');
 perform pg_temp.denied(format('select public.public_quotation(%L)',hash),'rotated old token denied');
 hash=rotated->>'token';
 perform pg_temp.denied(format('select public.public_quotation(%L,''pdf'')',hash),'disabled PDF denied');
 perform public.quotation_share_manage('${org}','revoke',jsonb_build_object('id',rotated->>'id'));
 perform pg_temp.denied(format('select public.public_quotation(%L)',hash),'revoked token denied');
 perform pg_temp.denied(format('select public.public_quotation(%L,''pdf'')',hash),'revoked public PDF denied');
 expired_revision=pg_temp.commit_quote(jsonb_build_object('action','create','project_id',mapping->>'project_id','currency','INR'));
 perform pg_temp.commit_quote(jsonb_build_object('action','save_line','revision_id',expired_revision,'version',1,'catalog_item_id',null,'area_id',null,'optional',false,'sort_order',0,'description','Customer description','snapshot',${literal(JSON.stringify(snapshot))}::jsonb,'cost',${literal(JSON.stringify(cost))}::jsonb));
 perform pg_temp.commit_quote(jsonb_build_object('action','issue','revision_id',expired_revision,'version',2));
 link=public.quotation_share_manage('${org}','create',jsonb_build_object('revision_id',expired_revision));
 response=public.public_quotation(link->>'token','respond','{"action":"declined","name":"Ravi","comment":"Timing changed","acknowledged":true}');
 perform pg_temp.assert_value(response->>'action'='declined','decline recorded');
 perform pg_temp.assert_value((select lifecycle='open' from public.leads where id=lead),'decline does not automatically lose lead');
 expired_revision=pg_temp.commit_quote(jsonb_build_object('action','clone','revision_id',n,'version',2));
 perform pg_temp.commit_quote(jsonb_build_object('action','edit_revision','revision_id',expired_revision,'version',1,'terms','','customer_notes','','internal_notes','private sales note','valid_until','2000-01-01','discount','{"kind":"none","value":"0"}'::jsonb));
 perform pg_temp.commit_quote(jsonb_build_object('action','issue','revision_id',expired_revision,'version',2));
 link=public.quotation_share_manage('${org}','create',jsonb_build_object('revision_id',expired_revision));hash=link->>'token';
 perform pg_temp.assert_value((public.public_quotation(hash)->>'expired')::boolean,'commercial expiry labeled');
 perform pg_temp.denied(format('select public.public_quotation(%L,''respond'',''{"action":"approved","name":"Ravi","acknowledged":true}'')',hash),'expired quotation approval denied');
 insert into share_test_state values(jsonb_build_object('expiring_share',link->>'id','hash',hash));
end$$;
reset role;
do $$declare response uuid;share uuid;hash text;begin
 select id into response from public.quotation_customer_responses where customer_name='Ravi' order by created_at desc limit 1;
 perform pg_temp.denied(format('update public.quotation_customer_responses set comment=''edited'' where id=%L',response),'responses append-only even for operator');
 select (payload->>'expiring_share')::uuid,payload->>'hash' into share,hash from share_test_state where payload ? 'expiring_share';
 update public.quotation_share_links set expires_at=now()-interval '1 second' where id=share;
 perform pg_temp.denied(format('select public.public_quotation(%L)',hash),'link expiry denied');
 perform pg_temp.assert_value(not exists(select 1 from public.audit_logs where metadata::text like '%token%'),'audit metadata has no tokens');
end$$;
set local role anon;
do $$declare hash text;payload jsonb;begin select s.payload->>'hash' into hash from share_test_state s where s.payload ? 'document';payload=public.public_quotation(hash);perform pg_temp.assert_value(payload->'document'->>'revision'='1','anonymous exact-revision projection');perform pg_temp.denied('select * from public.leads','anonymous tenant access denied');perform pg_temp.denied('select * from public.quotation_items','anonymous raw quotation denied');end$$;
reset role;
select payload->'document' from share_test_state where payload ? 'document';
rollback;`;
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
    expect(r.status, r.stderr).toBe(0);
    const doc = JSON.parse(
      r.stdout.split(/\r?\n/).find((line) => line.startsWith('{'))!,
    );
    const parsed = customerDocumentSchema.parse(doc);
    expect(parsed.totals.final_amount).toBe('200');
    expect(renderQuotationDocument(parsed)).not.toContain(
      'Internal override reason',
    );
  },
  30000,
);
