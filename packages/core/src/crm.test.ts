import { describe, expect, it } from 'vitest';
import {
  normalizePhone,
  followupQueue,
  crmSchemas,
  conversionSchema,
} from './crm';
import { customerResponseSchema, shareTokenSchema } from './quotation-sharing';
describe('CRM boundary validation', () => {
  it.each([
    ['+44 (20) 7946-0958', '+442079460958'],
    ['0044 20 7946 0958', '+442079460958'],
    ['020 7946 0958', '02079460958'],
    ['+1 202 555 0147', '+12025550147'],
  ])('normalizes %s without inventing a country', (input, output) =>
    expect(normalizePhone(input)).toBe(output),
  );
  it('classifies follow-ups with explicit timezone', () => {
    const now = new Date('2026-09-28T20:00:00Z');
    expect(followupQueue('2026-09-28T19:00:00Z', now, 'Asia/Calcutta')).toBe(
      'overdue',
    );
    expect(followupQueue('2026-09-28T22:00:00Z', now, 'Asia/Calcutta')).toBe(
      'today',
    );
    expect(followupQueue('2026-09-29T22:00:00Z', now, 'Asia/Calcutta')).toBe(
      'upcoming',
    );
  });
  it('rejects forged system activities and conversion authorities', () => {
    expect(
      crmSchemas.lead_activities.safeParse({
        lead_id: crypto.randomUUID(),
        activity_type: 'customer_response',
        body: 'forged',
      }).success,
    ).toBe(false);
    expect(
      conversionSchema.safeParse({
        id: crypto.randomUUID(),
        version: 1,
        customer_id: null,
        project_id: null,
        project_name: 'Home',
        acknowledge_duplicate: true,
        organization_id: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
  it('requires response acknowledgement and a change-request comment', () => {
    expect(
      customerResponseSchema.safeParse({
        action: 'approved',
        name: 'Ravi',
        comment: '',
        acknowledged: false,
      }).success,
    ).toBe(false);
    expect(
      customerResponseSchema.safeParse({
        action: 'changes_requested',
        name: 'Ravi',
        comment: '',
        acknowledged: true,
      }).success,
    ).toBe(false);
    expect(
      customerResponseSchema.safeParse({
        action: 'approved',
        name: 'Ravi',
        comment: '',
        acknowledged: true,
        amount: '1',
      }).success,
    ).toBe(false);
  });
  it('accepts only full opaque token encoding', () => {
    expect(shareTokenSchema.safeParse('Q-2026-1').success).toBe(false);
    expect(shareTokenSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });
});
