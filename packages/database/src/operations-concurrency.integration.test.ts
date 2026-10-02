import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'serializes receipt posting, transfer, issue, consumption, adjustment and execution finalization races',
  async () => {
    const bin =
        process.env.PSQL_PATH ??
        (process.platform === 'win32'
          ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
          : 'psql'),
      base = process.env.TEST_DATABASE_URL!,
      database = 'ops_race_' + randomUUID().replaceAll('-', ''),
      url = new URL(base);
    url.pathname = '/' + database;
    const args = (connection: string) => [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      connection,
    ];
    const run = (sql: string, connection = url.toString()) => {
      const r = spawnSync(bin, args(connection), {
        input: sql,
        encoding: 'utf8',
        timeout: 120000,
      });
      if (r.status !== 0) throw new Error(r.stderr || String(r.error));
      return r.stdout.trim();
    };
    const race = (sql: string) =>
      new Promise<{ code: number | null; error: string }>((resolve, reject) => {
        const child = spawn(bin, args(url.toString()), {
          stdio: ['pipe', 'ignore', 'pipe'],
        });
        let error = '';
        child.stderr.on('data', (d) => (error += String(d)));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, error }));
        child.stdin.end(sql);
      });
    const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'",
      json = (v: unknown) => literal(JSON.stringify(v)) + '::jsonb',
      org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      actor = '11111111-1111-4111-8111-111111111111';
    const auth = (sql: string) =>
      `begin;set local request.jwt.claim.sub='${actor}';set local role authenticated;${sql};select pg_sleep(0.1);commit;`;
    const rpc = (name: string, operation: string, input: unknown) =>
      `select public.${name}('${org}',${literal(operation)},${json(input)})`;
    const call = (name: string, op: string, input: unknown) =>
      run(auth(rpc(name, op, input))).split('\n')[0]!;
    const version = (table: string, id: string) =>
      Number(run(`select version from public.${table} where id='${id}'`));
    const competing = async (a: string, b = a) => {
      const outcomes = await Promise.all([race(auth(a)), race(auth(b))]);
      expect(
        outcomes.map((o) => o.code === 0).sort(),
        JSON.stringify(outcomes),
      ).toEqual([false, true]);
    };
    run(`create database "${database}"`, base);
    try {
      const verify = spawnSync(
        process.execPath,
        ['packages/database/scripts/verify.mjs'],
        {
          encoding: 'utf8',
          timeout: 180000,
          env: {
            ...process.env,
            TEST_DATABASE_URL: url.toString(),
            ALLOW_TEST_DATABASE_RESET: 'yes',
          },
        },
      );
      expect(verify.status, verify.stderr).toBe(0);
      const execution = readFileSync(
        'packages/database/tests/execution.sql',
        'utf8',
      ).replace(/rollback;\s*$/i, '');
      const inventory =
        readFileSync(
          'packages/database/tests/operations-inventory.sql',
          'utf8',
        ).split(' payload=jsonb_build_object')[0]! + 'end$$;';
      run(
        execution +
          `reset role;delete from public.organization_entitlements where organization_id='${org}' and not enabled and module_id in(select id from public.modules where key='billing');set local request.jwt.claim.sub='${actor}';set local role authenticated;` +
          inventory +
          'commit;',
      );
      const project = run(
          `select c.project_id from public.contracts c join public.quotation_revisions r on r.id=c.revision_id join public.quotations q on q.id=r.quotation_id where q.quotation_number='EXECUTION-TEST'`,
        ),
        contract = run(
          `select c.id from public.contracts c join public.quotation_revisions r on r.id=c.revision_id join public.quotations q on q.id=r.quotation_id where q.quotation_number='EXECUTION-TEST'`,
        ),
        store = run(
          "select id from public.inventory_locations where name='Central store'",
        ),
        site = run(
          "select id from public.inventory_locations where name='Project site'",
        ),
        receipt = run(
          'select gi.id from public.goods_receipt_items gi join public.purchase_order_items pi on pi.id=gi.po_item_id where pi.variant_id is not null',
        );
      const stock = (op: string, input: Record<string, unknown>) =>
        rpc('operations_stock', op, {
          project_id: project,
          reason: 'Independent session race',
          idempotency_key: randomUUID(),
          ...input,
        });
      await competing(
        stock('purchase_receipt', {
          receipt_item_id: receipt,
          destination_location_id: store,
        }),
        stock('purchase_receipt', {
          receipt_item_id: receipt,
          destination_location_id: store,
        }),
      );
      expect(
        run(
          `select count(*) from public.inventory_lots where receipt_item_id='${receipt}'`,
        ),
      ).toBe('1');
      const lot = run(
          `select id from public.inventory_lots where receipt_item_id='${receipt}'`,
        ),
        variant = run(
          `select variant_id from public.inventory_lots where id='${lot}'`,
        );
      const count = (location: string) =>
        run(
          auth(
            stock('count', {
              lot_id: lot,
              source_location_id: location,
              physical_quantity: '5',
            }),
          ),
        );
      const warehouse = call('operations_save', 'inventory_locations', {
        name: 'Race warehouse',
        kind: 'warehouse',
      });
      count(store);
      await competing(
        stock('transfer', {
          lot_id: lot,
          source_location_id: store,
          destination_location_id: warehouse,
          quantity: '4',
        }),
        stock('transfer', {
          lot_id: lot,
          source_location_id: store,
          destination_location_id: warehouse,
          quantity: '3',
        }),
      );
      count(store);
      const request = call('operations_issue_request', 'create', {
        project_id: project,
        source_location_id: store,
        destination_location_id: site,
        reason: 'Race material request',
        items: [{ variant_id: variant, unit: 'sheet', quantity: '7' }],
      });
      call('operations_issue_request', 'submit', { id: request, version: 1 });
      const item = run(
        `select id from public.material_issue_request_items where request_id='${request}'`,
      );
      call('operations_issue_request', 'approve', {
        id: request,
        version: 2,
        items: [{ id: item, approved_quantity: '7' }],
      });
      await competing(
        stock('issue_to_site', {
          lot_id: lot,
          source_location_id: store,
          destination_location_id: site,
          request_item_id: item,
          quantity: '4',
        }),
        stock('issue_to_site', {
          lot_id: lot,
          source_location_id: store,
          destination_location_id: site,
          request_item_id: item,
          quantity: '3',
        }),
      );
      count(site);
      await competing(
        stock('consumption', {
          lot_id: lot,
          source_location_id: site,
          quantity: '4',
        }),
        stock('consumption', {
          lot_id: lot,
          source_location_id: site,
          quantity: '3',
        }),
      );
      count(store);
      await competing(
        stock('adjustment', {
          lot_id: lot,
          source_location_id: store,
          quantity: '-4',
        }),
        stock('adjustment', {
          lot_id: lot,
          source_location_id: store,
          quantity: '-3',
        }),
      );
      expect(
        run(
          'select count(*) from(select sum(quantity::numeric) q from public.inventory_movements group by location_id,lot_id having sum(quantity::numeric)<0)x',
        ),
      ).toBe('0');
      const plan = call('operations_plan', 'create', { contract_id: contract }),
        task = call('operations_save', 'project_tasks', {
          project_id: project,
          plan_id: plan,
          title: 'Race completion',
        }),
        revision = run(
          `select id from public.execution_plan_revisions where plan_id='${plan}'`,
        );
      call('operations_plan', 'approve', { id: revision, version: 1 });
      call('operations_plan', 'status', {
        id: plan,
        version: 1,
        status: 'in_progress',
      });
      await competing(
        rpc('operations_task', 'task', {
          id: task,
          version: 1,
          status: 'done',
        }),
      );
      expect(
        run(
          `select count(*) from public.project_execution_events where entity_id='${task}' and to_status='done'`,
        ),
      ).toBe('1');
      const snag = call('operations_snag', 'create', {
        project_id: project,
        title: 'Race snag',
        priority: 'critical',
      });
      call('operations_snag', 'transition', {
        id: snag,
        version: 1,
        status: 'in_progress',
      });
      call('operations_snag', 'transition', {
        id: snag,
        version: 2,
        status: 'ready_for_review',
        resolution: 'Rectified issue',
      });
      call('operations_snag', 'transition', {
        id: snag,
        version: 3,
        status: 'verified',
        verification: 'Checked correction',
      });
      await competing(
        rpc('operations_snag', 'transition', {
          id: snag,
          version: 4,
          status: 'closed',
          verification: 'Accepted correction',
        }),
      );
      const template = call('operations_save', 'inspection_templates', {
          name: 'Race final inspection',
          is_final: true,
          checklist: [{ key: 'finish', label: 'Finish', required: true }],
        }),
        inspection = call('operations_inspection', 'create', {
          project_id: project,
          template_id: template,
          inspector_id: actor,
        });
      await competing(
        rpc('operations_inspection', 'approve', {
          id: inspection,
          version: 1,
          status: 'passed',
          results: [{ key: 'finish', result: 'pass' }],
        }),
      );
      call('operations_plan', 'status', {
        id: plan,
        version: version('execution_plans', plan),
        status: 'punch_list',
      });
      const ht = call('operations_save', 'handover_templates', {
          name: 'Race handover',
          checklist: [{ key: 'keys', label: 'Keys', required: true }],
        }),
        handover = call('operations_handover', 'create', {
          plan_id: plan,
          template_id: ht,
        });
      await competing(
        rpc('operations_handover', 'approve', {
          id: handover,
          version: 1,
          results: [{ key: 'keys', result: 'pass' }],
          materials_review: 'Stock reviewed and reconciled',
          commercial_review: 'Commercial outstanding reviewed',
        }),
      );
      expect(
        run(
          `select count(*) from public.project_execution_events where entity_id='${handover}' and action='handover.approve'`,
        ),
      ).toBe('1');
    } finally {
      // This database was created above with a generated, validated test-only name.
      if (!/^ops_race_[a-f0-9]{32}$/.test(database))
        throw new Error('Unexpected test database name');
      run(`drop database "${database}" with(force)`, base);
    }
  },
  300000,
);
