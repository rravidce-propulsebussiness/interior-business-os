import { spawn } from 'node:child_process';
import { psql } from './postgres.mjs';
// Run only against a separate disposable clone: these races deliberately commit history.
if (process.env.ALLOW_AUTOMATION_RACE_FIXTURES !== 'yes')
  throw new Error('A disposable race database must be explicitly enabled');
const org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const owner = '11111111-1111-4111-8111-111111111111';
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const auth = (sql) =>
  `begin;set local request.jwt.claim.sub=${quote(owner)};set local role authenticated;${sql};commit;`;
const scalar = (sql) => psql(['-qAtc', sql]);
const config = {
  name: 'Concurrent rule',
  description: '',
  event: 'lead.created',
  mode: 'event',
  status: 'active',
  conditions: [],
  actions: [
    {
      kind: 'notify',
      recipient: 'actor',
      title: 'Concurrent review',
      priority: 'normal',
      delayMinutes: 0,
      dueBasis: 'event',
      template: 'race_notice',
      audience: 'internal',
    },
  ],
  cooldownMinutes: 1,
  maxPerEntity: 3,
  dailyLimit: 100,
  scheduleHour: 0,
};
function assert(ok, label) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}
async function session(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      process.env.PSQL_PATH ?? 'C:/Program Files/PostgreSQL/18/bin/psql.exe',
      [
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        process.env.TEST_DATABASE_URL,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      error = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      error += data;
    });
    child.on('error', (error) =>
      resolve({ code: 1, output: '', error: error.message }),
    );
    child.on('close', (code) =>
      resolve({ code, output: output.trim(), error }),
    );
    child.stdin.end(`set statement_timeout='30s';${sql}`);
  });
}
async function race(sql) {
  const results = await Promise.all([session(sql), session(sql)]);
  assert(
    results.every((result) => result.code === 0),
    'both concurrent database sessions complete: ' +
      results
        .filter((r) => r.code)
        .map((r) => r.error)
        .join(''),
  );
  return results;
}
const rule = JSON.parse(
  scalar(
    auth(
      `select public.automation_rule_save('${org}',null,0,${quote(JSON.stringify(config))})`,
    ),
  ),
).id;
const source = scalar(
  auth(
    `select public.crm_save('${org}','leads',jsonb_build_object('name','Race enquiry','phone','+12025550299','source_id',(select id from public.lead_sources where organization_id='${org}' and active limit 1),'stage_id',(select id from public.crm_pipeline_stages where organization_id='${org}' and outcome='open' and active order by sort_order limit 1)))`,
  ),
);
await race(
  "begin;set local role business_os_worker;select private.automation_tick('race-worker',100);commit;",
);
assert(
  scalar(
    `select count(*) from public.automation_executions where rule_id='${rule}'`,
  ) === '1',
  'same event claimed by two workers creates one execution',
);
assert(
  scalar(
    `select count(*) from public.notifications n join public.automation_events e on e.id=n.event_id where e.entity_id='${source}'`,
  ) === '1',
  'same execution creates one notification',
);
await race(
  "begin;set local role business_os_worker;select private.automation_tick('race-worker',100);commit;",
);
assert(
  scalar(
    `select count(*) from public.automation_executions where rule_id='${rule}'`,
  ) === '1',
  'repeated concurrent execution is idempotent',
);
const notification = scalar(
  `select n.id from public.notifications n join public.automation_events e on e.id=n.event_id where e.entity_id='${source}'`,
);
await race(
  auth(`select public.notification_state('${org}','${notification}',1,'read')`),
);
assert(
  scalar(
    `select version from public.notifications where id='${notification}'`,
  ) === '2',
  'concurrent identical notification updates advance version once',
);
const edits = await Promise.all([
  session(
    auth(
      `select public.automation_rule_save('${org}','${rule}',1,${quote(JSON.stringify({ ...config, name: 'Admin one' }))})`,
    ),
  ),
  session(
    auth(
      `select public.automation_rule_save('${org}','${rule}',1,${quote(JSON.stringify({ ...config, name: 'Admin two' }))})`,
    ),
  ),
]);
assert(
  edits.filter((result) => result.code === 0).length === 1,
  'two admin edits accept exactly one expected version',
);
config.event = 'lead.followup_due';
config.mode = 'scheduled';
config.actions[0].recipient = 'assignee';
const scheduledRule = JSON.parse(
  scalar(
    auth(
      `select public.automation_rule_save('${org}',null,0,${quote(JSON.stringify(config))})`,
    ),
  ),
).id;
const followup = scalar(
  auth(
    `select public.crm_save('${org}','lead_followups',jsonb_build_object('lead_id','${source}','assigned_to','${owner}','due_at',now()-interval '1 day','followup_type','call','note','Race fixture'))`,
  ),
);
await race(
  "begin;set local role business_os_worker;select private.automation_tick('scheduled-race',100);commit;",
);
assert(
  scalar(
    `select count(*) from public.automation_executions x join public.automation_events e on e.id=x.event_id where x.rule_id='${scheduledRule}' and e.entity_id='${followup}'`,
  ) === '1',
  'same scheduled reminder creates one execution',
);
scalar(
  auth(
    `select public.notification_preferences_save('${org}',0,'{"inApp":true,"email":true,"categories":["crm"],"timezone":"UTC","quietStart":null,"quietEnd":null}');select public.automation_configure('${org}','template',0,'{"key":"race_notice","subject":"Review {{entity_number}}","body":"Review this record"}')`,
  ),
);
config.event = 'lead.created';
config.mode = 'event';
config.actions[0].kind = 'email';
config.actions[0].recipient = 'actor';
scalar(
  auth(
    `select public.automation_rule_save('${org}','${rule}',2,${quote(JSON.stringify(config))});select public.crm_save('${org}','leads',jsonb_build_object('name','Race email enquiry','phone','+12025550298','source_id',(select id from public.lead_sources where organization_id='${org}' and active limit 1),'stage_id',(select id from public.crm_pipeline_stages where organization_id='${org}' and outcome='open' and active order by sort_order limit 1)))`,
  ),
);
scalar(
  "begin;set local role business_os_worker;select private.automation_tick('email-race',100);commit;",
);
const claims = await race(
  'begin;set local role business_os_worker;select private.automation_email_claim(10);commit;',
);
assert(
  claims.flatMap((result) => JSON.parse(result.output)).length === 1,
  'two email workers receive exactly one delivery lease',
);
console.log(
  'Six required race classes verified against independent concurrent PostgreSQL sessions. No external email was sent.',
);
