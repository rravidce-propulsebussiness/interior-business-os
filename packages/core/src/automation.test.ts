import { describe, expect, it } from 'vitest';
import {
  ruleSchema,
  preferenceSchema,
  reportFilterSchema,
  renderEmail,
  reportCsv,
} from './automation';

describe('structured automation input', () => {
  it('defaults to paused and requires a bounded structured action', () => {
    const rule = ruleSchema.parse({
      name: 'New lead',
      event: 'lead.created',
      actions: [{ kind: 'notify', title: 'Review lead' }],
    });
    expect(rule.status).toBe('paused');
    expect(rule.actions[0]?.delayMinutes).toBe(0);
    expect(
      ruleSchema.safeParse({
        ...rule,
        actions: [{ ...rule.actions[0], script: 'arbitrary code' }],
      }).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({
        ...rule,
        conditions: [{ field: 'status', operator: 'eq' }],
      }).success,
    ).toBe(false);
    expect(ruleSchema.safeParse({ ...rule, dailyLimit: 1001 }).success).toBe(
      false,
    );
    expect(
      ruleSchema.safeParse({
        ...rule,
        actions: [{ ...rule.actions[0], recipient: 'user' }],
      }).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({
        ...rule,
        actions: [{ ...rule.actions[0], audience: 'customer' }],
      }).success,
    ).toBe(false);
  });
  it('requires valid timezone and keeps email opt-in', () => {
    expect(preferenceSchema.parse({}).email).toBe(false);
    expect(
      preferenceSchema.safeParse({ timezone: 'Invalid/Zone' }).success,
    ).toBe(false);
    expect(preferenceSchema.parse({ timezone: 'Asia/Kolkata' }).timezone).toBe(
      'Asia/Kolkata',
    );
  });
  it('rejects reversed report periods and invalid dates', () => {
    expect(
      reportFilterSchema.safeParse({ from: '2026-10-03', to: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(
      reportFilterSchema.safeParse({ from: '2026-02-30', to: '2026-10-01' })
        .success,
    ).toBe(false);
  });
});
describe('export and email text boundaries', () => {
  it('quotes CSV values and neutralizes spreadsheet formulas', () => {
    expect(
      reportCsv(
        ['name', 'amount'],
        [{ name: '=HYPERLINK("malicious")', amount: '120.00' }],
      ),
    ).toBe('\uFEFF"name","amount"\r\n"\'=HYPERLINK(""malicious"")","120.00"');
  });
  it('renders only controlled variables and removes subject newlines', () => {
    expect(
      renderEmail(
        {
          key: 'notice',
          subject: '{{business_name}}',
          body: 'Due {{amount_due}} {{currency}}',
        },
        {
          business_name: 'Name\r\nBcc: other',
          amount_due: '120.00',
          currency: 'INR',
        },
      ),
    ).toEqual({ subject: 'Name  Bcc: other', text: 'Due 120.00 INR' });
    expect(() =>
      renderEmail({ key: 'notice', subject: '{{password}}', body: 'Text' }, {}),
    ).toThrow();
  });
});
