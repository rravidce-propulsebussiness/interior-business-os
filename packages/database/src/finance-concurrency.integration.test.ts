import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  catalogLine,
  catalogSchema,
  noDiscount,
} from '@business-os/quotation-engine';
import { attestQuotation } from './quotation-attestation';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'serializes finance handoff, issue, payment, allocation and approval races with canonical catalog pricing',
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
      const r = spawnSync(bin, args, { input: sql, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    const race = (sql: string) =>
      new Promise<{ code: number | null; error: string }>((resolve, reject) => {
        const c = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
        let error = '';
        c.stderr.on('data', (v) => (error += String(v)));
        c.on('error', reject);
        c.on('close', (code) => resolve({ code, error }));
        c.stdin.end(sql);
      });
    const org = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      actor = '11111111-1111-4111-8111-111111111111',
      name = 'FIN-' + randomUUID();
    const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    const json = (v: unknown) => literal(JSON.stringify(v)) + '::jsonb';
    const auth = (sql: string) =>
      `begin;set local request.jwt.claim.sub='${actor}';set local role authenticated;${sql};commit;`;
    const fixture = readFileSync(
      new URL('../tests/finance.sql', import.meta.url),
      'utf8',
    ).split('set local role authenticated;')[0]!;
    run(fixture.replaceAll('FINANCE-TEST', name) + 'commit;');
    const revision = run(
      `select current_revision_id from public.quotations where quotation_number='${name}'`,
    );
    const create = auth(
      `select public.contract_create('${org}','${revision}')`,
    );
    const handoffs = await Promise.all([race(create), race(create)]);
    expect(
      handoffs.map((r) => r.code),
      JSON.stringify(handoffs),
    ).toEqual([0, 0]);
    expect(
      run(
        `select count(*) from public.contracts where revision_id='${revision}'`,
      ),
    ).toBe('1');
    const contract = run(
      `select id from public.contracts where revision_id='${revision}'`,
    );
    const invoiceInput = {
      invoice_type: 'tax_invoice',
      issue_date: '2026-09-29',
      tax_mode: 'exclusive',
      tax_application: 'line',
      items: [
        {
          description: 'Race invoice',
          quantity: '1',
          unit_rate: '300',
          source_type: 'manual',
        },
      ],
    };
    const invoice = run(
      auth(
        `select public.invoice_save('${org}','${contract}',${json(invoiceInput)})`,
      ),
    );
    const issue = auth(`select public.invoice_issue('${org}','${invoice}',1)`);
    const issued = await Promise.all([race(issue), race(issue)]);
    expect(
      issued.map((r) => r.code),
      JSON.stringify(issued),
    ).toEqual([0, 0]);
    expect(
      run(`select version from public.invoices where id='${invoice}'`),
    ).toBe('2');
    const numbered = [0, 1].map(() =>
      run(
        auth(
          `select public.invoice_save('${org}','${contract}',${json({ ...invoiceInput, items: [{ ...invoiceInput.items[0], unit_rate: '100' }] })})`,
        ),
      ),
    );
    const numbers = await Promise.all(
      numbered.map((id) =>
        race(auth(`select public.invoice_issue('${org}','${id}',1)`)),
      ),
    );
    expect(
      numbers.map((r) => r.code),
      JSON.stringify(numbers),
    ).toEqual([0, 0]);
    expect(
      run(
        `select count(distinct invoice_number) from public.invoices where id in ('${numbered[0]}','${numbered[1]}')`,
      ),
    ).toBe('2');
    const method = run(
      `select id from public.payment_methods where organization_id='${org}' and active order by id limit 1`,
    );
    const key = randomUUID();
    const record = auth(
      `select public.payment_record('${org}','${contract}',${json({ idempotency_key: key, payment_date: '2026-09-29', amount: '200', method_id: method, allocations: [] })})`,
    );
    const recorded = await Promise.all([race(record), race(record)]);
    expect(
      recorded.map((r) => r.code),
      JSON.stringify(recorded),
    ).toEqual([0, 0]);
    const payment = run(
      `select id from public.payments where idempotency_key='${key}'`,
    );
    expect(
      run(`select count(*) from public.receipts where payment_id='${payment}'`),
    ).toBe('1');
    const allocate = () =>
      auth(
        `select public.payment_allocate('${org}','${payment}',${json({ invoice_id: invoice, amount: '150', idempotency_key: randomUUID() })})`,
      );
    const allocated = await Promise.all([race(allocate()), race(allocate())]);
    expect(allocated.filter((r) => r.code === 0)).toHaveLength(1);
    expect(run(`select private.payment_allocated('${payment}')`)).toBe('150');
    expect(run(`select private.invoice_paid('${invoice}')`)).toBe('150');
    const signingKey = run(
      'select secret_hex from private.quotation_signing_keys where singleton',
    );
    const signed = (
      operation: 'finance_pricing' | 'finance_change',
      payload: Record<string, unknown>,
    ) => {
      const s = attestQuotation(signingKey, actor, org, operation, payload);
      return `${operation === 'finance_pricing' ? 'public.change_order_pricing_context' : 'public.change_order_command'}(${literal(s.p_message)},${literal(s.p_signature)})`;
    };
    const catalog = catalogSchema.parse(
      JSON.parse(run(auth(`select public.catalog_snapshot('${org}',true)`))),
    );
    const item = catalog.items.find((i) => i.key === 'wardrobe')!;
    const context = JSON.parse(
      run(
        auth(
          `select ${signed('finance_pricing', { contract_id: contract, item_id: item.id })}`,
        ),
      ),
    ) as { catalog: unknown; fingerprint: string };
    const { snapshot } = catalogLine(catalogSchema.parse(context.catalog), {
      description: 'Finish upgrade',
      area_id: null,
      optional: false,
      sort_order: 0,
      discount: noDiscount,
      override: null,
      pricing: {
        organization_id: org,
        item_id: item.id,
        branch_id: null,
        price_book_id: null,
        currency: 'INR',
        at: new Date().toISOString(),
        measurements: { width: '8', height: '7' },
        answers: {
          grade: 'bwp',
          finish: 'pu',
          hardware: 'hettich',
          shutter: 'hinged',
          pu_finish: 'matte',
        },
      },
    });
    expect(snapshot.final_amount).toBe('133280');
    const original = run(
      `select id from public.quotation_items where revision_id='${revision}'`,
    );
    const payload = {
      action: 'save',
      contract_id: contract,
      reason: 'Customer finish upgrade',
      items: [
        {
          change_type: 'modification',
          description: 'Upgraded wardrobe',
          reason: 'Customer finish upgrade',
          original_item_id: original,
          pricing_type: 'catalog',
          snapshot,
          fingerprint: context.fingerprint,
        },
      ],
    };
    const bad = await race(
      auth(
        `select ${signed('finance_change', { ...payload, items: [{ ...payload.items[0], fingerprint: 'stale' }] })}`,
      ),
    );
    expect(bad.code).not.toBe(0);
    expect(bad.error).toContain('Stale or mismatched');
    const change = run(auth(`select ${signed('finance_change', payload)}`));
    run(
      auth(
        `select ${signed('finance_change', { action: 'issue', contract_id: contract, id: change, version: 1 })}`,
      ),
    );
    const approve = () =>
      auth(
        `select ${signed('finance_change', { action: 'approve', contract_id: contract, id: change, version: 2, evidence: 'Customer signed revised scope' })}`,
      );
    const approvals = await Promise.all([race(approve()), race(approve())]);
    expect(
      approvals.map((r) => r.code),
      JSON.stringify(approvals),
    ).toEqual([0, 0]);
    expect(
      run(
        `select original_contract_value from public.contracts where id='${contract}'`,
      ),
    ).toBe('1000');
    expect(
      run(
        `select net_adjustment from public.change_orders where id='${change}'`,
      ),
    ).toBe('132280');
    expect(run(`select private.contract_value('${contract}')`)).toBe('133280');
    expect(
      run(`select version from public.change_orders where id='${change}'`),
    ).toBe('3');
    const ids = [0, 1].map(() => {
      const id = run(
        auth(
          `select ${signed('finance_change', { action: 'save', contract_id: contract, reason: 'Additional scope', items: [{ change_type: 'price_adjustment', description: 'Extra scope', reason: 'Agreed extra', adjustment: '100' }] })}`,
        ),
      );
      run(
        auth(
          `select ${signed('finance_change', { action: 'issue', contract_id: contract, id, version: 1 })}`,
        ),
      );
      return id;
    });
    const competing = await Promise.all(
      ids.map((id) =>
        race(
          auth(
            `select ${signed('finance_change', { action: 'approve', contract_id: contract, id, version: 2, evidence: 'Signed scope' })}`,
          ),
        ),
      ),
    );
    expect(competing.filter((r) => r.code === 0)).toHaveLength(1);
    expect(competing.find((r) => r.code !== 0)?.error).toContain(
      'Contract changed since issue',
    );
  },
  60000,
);
