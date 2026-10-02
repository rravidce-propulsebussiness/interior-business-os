import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'serializes execution approval, revision, issue, receiving and quote updates; preserves cancelled split-award pennies',
  async () => {
    const bin =
      process.env.PSQL_PATH ??
      (process.platform === 'win32'
        ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
        : 'psql');
    const args = [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      process.env.TEST_DATABASE_URL!,
    ];
    const run = (sql: string) => {
      const result = spawnSync(bin, args, { input: sql, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const race = (sql: string) =>
      new Promise<{ code: number | null; error: string }>((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
        let error = '';
        child.stderr.on('data', (chunk) => (error += String(chunk)));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, error }));
        child.stdin.end(sql);
      });
    const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const json = (value: unknown) => literal(JSON.stringify(value)) + '::jsonb';
    const org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      actor = '11111111-1111-4111-8111-111111111111',
      name = 'EXEC-' + randomUUID();
    const auth = (sql: string) =>
      `begin;set local request.jwt.claim.sub='${actor}';set local role authenticated;${sql};commit;`;
    const call = (name: string, ...values: string[]) =>
      run(auth(`select public.${name}('${org}',${values.join(',')})`));
    const fixture = readFileSync(
      new URL('../tests/finance.sql', import.meta.url),
      'utf8',
    ).split('set local role authenticated;')[0]!;
    run(fixture.replaceAll('FINANCE-TEST', name) + 'commit;');
    const grant1 = randomUUID(),
      grant2 = randomUUID();
    run(
      `insert into public.organization_entitlements(id,organization_id,module_id,enabled,source) select '${grant1}','${org}',id,true,'manual' from public.modules where key='purchasing';insert into public.organization_entitlements(id,organization_id,module_id,enabled,source) select '${grant2}','${org}',id,true,'manual' from public.modules where key='vendors';`,
    );
    try {
      const commercial = run(
        `select current_revision_id from public.quotations where quotation_number=${literal(name)}`,
      );
      const contract = call('contract_create', literal(commercial));
      const revision = call(
        'execution_estimate_command',
        "'create'",
        json({ contract_id: contract }),
      );
      const scope = run(
        `select id from public.execution_estimate_scope_items where revision_id='${revision}'`,
      );
      const line = call(
        'execution_line_save',
        literal(revision),
        json({
          version: 1,
          scope_id: scope,
          method: 'manual',
          cost_kind: 'labour',
          unit: 'hour',
          description: name,
          rule: { basis: 'fixed', factor: '3' },
          manual_cost: {
            unit_cost: '0.01',
            source_reference: 'Test',
            reason: 'Test labour basis',
          },
        }),
      );
      call(
        'execution_estimate_command',
        "'submit'",
        json({ id: revision, version: 2 }),
      );
      const approve = auth(
        `select public.execution_estimate_command('${org}','approve',${json({ id: revision, version: 3 })})`,
      );
      const approvals = await Promise.all([race(approve), race(approve)]);
      expect(
        approvals.map((r) => r.code === 0).sort(),
        JSON.stringify(approvals),
      ).toEqual([false, true]);
      expect(approvals.find((r) => r.code !== 0)?.error).toContain(
        'Stale estimate revision',
      );
      expect(
        run(
          `select count(*) from public.execution_estimate_documents where revision_id='${revision}'`,
        ),
      ).toBe('1');
      const revise = auth(
        `select public.execution_estimate_command('${org}','revise',${json({ id: revision, version: 4 })})`,
      );
      const revisions = await Promise.all([race(revise), race(revise)]);
      expect(
        revisions.map((r) => r.code),
        JSON.stringify(revisions),
      ).toEqual([0, 0]);
      expect(
        run(
          `select count(*) from public.execution_estimate_revisions where estimate_id=(select estimate_id from public.execution_estimate_revisions where id='${revision}') and status='draft'`,
        ),
      ).toBe('1');
      const pr = call(
        'execution_requisition_create',
        json({
          revision_id: revision,
          idempotency_key: randomUUID(),
          delivery_location: 'Test site',
          sources: [{ line_id: line, quantity: '3' }],
        }),
      );
      call('execution_requisition_transition', literal(pr), '1', "'submit'");
      call('execution_requisition_transition', literal(pr), '2', "'approve'");
      const vendor = call(
        'execution_configure',
        "'vendors'",
        json({ name, code: name }),
      );
      const prItem = run(
        `select id from public.purchase_requisition_items where requisition_id='${pr}'`,
      );
      const rfq = call(
        'execution_rfq_create',
        json({
          requisition_id: pr,
          idempotency_key: randomUUID(),
          vendor_ids: [vendor],
          items: [{ requisition_item_id: prItem, quantity: '3' }],
        }),
      );
      call('execution_rfq_transition', literal(rfq), '1', "'issue'");
      const rfqItem = run(
        `select id from public.rfq_items where rfq_id='${rfq}'`,
      );
      const quoteInput = {
        rfq_id: rfq,
        vendor_id: vendor,
        reference: name,
        currency: 'INR',
        valid_until: '2099-01-01',
        idempotency_key: randomUUID(),
        freight: '0',
        items: [
          {
            rfq_item_id: rfqItem,
            quantity: '3',
            unit_price: '0.003333',
            discount: '0',
            tax_mode: 'exclusive',
            tax_components: [],
          },
        ],
      };
      const quote = call('execution_vendor_quote_save', json(quoteInput));
      call(
        'execution_vendor_quote_transition',
        literal(quote),
        '1',
        "'record'",
      );
      const quoteItem = run(
        `select id from public.vendor_quote_items where quote_id='${quote}'`,
      );
      const createPo = (quantity: string) =>
        call(
          'execution_po_create',
          json({
            quote_id: quote,
            idempotency_key: randomUUID(),
            items: [{ quote_item_id: quoteItem, quantity }],
          }),
        );
      const first = createPo('1'),
        second = createPo('1');
      const issue = auth(
        `select public.execution_po_transition('${org}','${first}',1,'issue')`,
      );
      const issues = await Promise.all([race(issue), race(issue)]);
      expect(
        issues.map((r) => r.code === 0).sort(),
        JSON.stringify(issues),
      ).toEqual([false, true]);
      expect(issues.find((r) => r.code !== 0)?.error).toContain(
        'Stale purchase order',
      );
      call('execution_po_transition', literal(second), '1', "'issue'");
      call(
        'execution_po_transition',
        literal(first),
        '2',
        "'cancel'",
        "'Replace first award'",
      );
      const replacement = createPo('2');
      call('execution_po_transition', literal(replacement), '1', "'issue'");
      expect(
        run(
          `select trim_scale(sum(c.total::numeric)) from public.purchase_order_costs c join public.purchase_orders p on p.id=c.po_id where p.quote_id='${quote}' and p.status='issued'`,
        ),
      ).toBe('0.01');
      const receivingItem = run(
        `select id from public.purchase_order_items where po_id='${replacement}'`,
      );
      const receive = () =>
        auth(
          `select public.execution_receipt_record('${org}',${json({ po_id: replacement, idempotency_key: randomUUID(), items: [{ po_item_id: receivingItem, received_quantity: '1.5', accepted_quantity: '1.5', rejected_quantity: '0' }] })})`,
        );
      const receipts = await Promise.all([race(receive()), race(receive())]);
      expect(
        receipts.map((r) => r.code === 0).sort(),
        JSON.stringify(receipts),
      ).toEqual([false, true]);
      expect(receipts.find((r) => r.code !== 0)?.error).toContain(
        'cannot exceed ordered quantity',
      );
      expect(
        run(
          `select trim_scale(sum(received_quantity::numeric)) from public.goods_receipt_items where po_item_id='${receivingItem}'`,
        ),
      ).toBe('1.5');
      const draft = call(
        'execution_vendor_quote_save',
        json({
          ...quoteInput,
          idempotency_key: randomUUID(),
          reference: name + '-edit',
        }),
      );
      const update = (rate: string) =>
        auth(
          `select public.execution_vendor_quote_save('${org}',${json({ ...quoteInput, id: draft, version: 1, reference: name + '-edited', items: [{ ...quoteInput.items[0], unit_price: rate }] })})`,
        );
      const edits = await Promise.all([
        race(update('0.02')),
        race(update('0.03')),
      ]);
      expect(
        edits.map((r) => r.code === 0).sort(),
        JSON.stringify(edits),
      ).toEqual([false, true]);
      expect(edits.find((r) => r.code !== 0)?.error).toContain(
        'Current draft vendor quote required',
      );
      expect(
        run(`select version from public.vendor_quotes where id='${draft}'`),
      ).toBe('2');
      const before = call(
        'execution_document',
        "'purchase_orders'",
        literal(second),
      );
      const after = run(
        `begin;update public.vendors set billing_address='{"line1":"Changed after issue"}' where id='${vendor}';update public.organizations set name='Changed business after issue' where id='${org}';set local request.jwt.claim.sub='${actor}';set local role authenticated;select public.execution_document('${org}','purchase_orders','${second}');rollback;`,
      );
      expect(after).toBe(before);
      const successor = run(
        `select id from public.execution_estimate_revisions where estimate_id=(select estimate_id from public.execution_estimate_revisions where id='${revision}') and status='draft'`,
      );
      const successorLine = run(
        `select id from public.execution_estimate_lines where revision_id='${successor}'`,
      );
      const successorScope = run(
        `select scope_id from public.execution_estimate_lines where id='${successorLine}'`,
      );
      call(
        'execution_line_save',
        literal(successor),
        json({
          id: successorLine,
          version: 1,
          scope_id: successorScope,
          method: 'manual',
          cost_kind: 'labour',
          unit: 'hour',
          description: name,
          rule: { basis: 'fixed', factor: '2' },
          manual_cost: {
            unit_cost: '0.01',
            source_reference: 'Revised basis',
            reason: 'Reduce remaining requirement',
          },
        }),
      );
      call(
        'execution_estimate_command',
        "'submit'",
        json({ id: successor, version: 2 }),
      );
      call(
        'execution_estimate_command',
        "'approve'",
        json({ id: successor, version: 3 }),
      );
      call(
        'execution_po_transition',
        literal(second),
        '2',
        "'cancel'",
        "'Reduce remaining award'",
      );
      const obsolete = createPo('1');
      const blocked = await race(
        auth(
          `select public.execution_po_transition('${org}','${obsolete}',1,'issue')`,
        ),
      );
      expect(blocked.code).not.toBe(0);
      expect(blocked.error).toContain(
        'remaining current approved scope demand',
      );
      expect(
        JSON.parse(
          call(
            'execution_document',
            "'execution_estimate_revisions'",
            literal(revision),
          ),
        ).total,
      ).toBe('0.03');
    } finally {
      run(
        `delete from public.organization_entitlements where id in ('${grant1}','${grant2}')`,
      );
    }
  },
  120000,
);
