import { describe, expect, it } from 'vitest';
import { whatsappMenuMessage } from './whatsapp-menu';

const ruleId = '0f8e3c2a-1b2c-4d5e-8f90-123456789abc';

describe('WhatsApp auto-reply menu', () => {
  it('lists options as text and as a tappable list', () => {
    const message = whatsappMenuMessage('Hi Ravi, how can we help?', {
      rule_id: ruleId,
      menu: [
        { key: '1', title: 'Accounts', reply: 'a' },
        { key: '2', title: 'Sales and new projects', reply: 'b' },
      ],
    });
    expect(message?.text).toBe(
      'Hi Ravi, how can we help?\n\n1. Accounts\n2. Sales and new projects\n\nReply with a number, or type MENU to see this again.',
    );
    const rows = message?.interactive.action.sections[0]?.rows ?? [];
    expect(rows).toEqual([
      { id: `menu:${ruleId}:1`, title: '1. Accounts' },
      { id: `menu:${ruleId}:2`, title: '2. Sales and new project' },
    ]);
    expect(rows[1]!.title.length).toBeLessThanOrEqual(24);
  });

  it('returns null without options or a rule id', () => {
    expect(whatsappMenuMessage('x', { rule_id: ruleId, menu: [] })).toBeNull();
    expect(
      whatsappMenuMessage('x', {
        menu: [{ key: '1', title: 'A', reply: 'r' }],
      }),
    ).toBeNull();
  });
});
