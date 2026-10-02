import { describe, expect, it } from 'vitest';
import { parseOperationCommand } from './operations-command';

const id = '00000000-0000-4000-8000-000000000001';
describe('operational command boundaries', () => {
  const input = {
    project_id: id,
    lot_id: id,
    source_location_id: id,
    quantity: '0.125000',
    reason: 'Installed',
    idempotency_key: id,
  };
  it('preserves exact decimal quantities and rejects numeric JSON quantities', () => {
    expect(
      parseOperationCommand({ action: 'stock_consumption', input }).input
        .quantity,
    ).toBe('0.125000');
    expect(() =>
      parseOperationCommand({
        action: 'stock_consumption',
        input: { ...input, quantity: 0.125 },
      }),
    ).toThrow();
  });
  it('rejects caller supplied ownership and permission overrides', () => {
    for (const extra of [
      { organization_id: id },
      { permission: 'inventory.adjust' },
      { cost: '100' },
    ])
      expect(() =>
        parseOperationCommand({
          action: 'stock_consumption',
          input: { ...input, ...extra },
        }),
      ).toThrow();
  });
  it('validates every nested approval item and bounds batch sizes', () => {
    const command = {
      action: 'request_approve',
      input: { id, version: 1, items: [{ id, approved_quantity: '2.5' }] },
    };
    expect(parseOperationCommand(command).definition.permission).toBe(
      'material_issue.approve',
    );
    expect(() =>
      parseOperationCommand({
        ...command,
        input: {
          ...command.input,
          items: [{ id, approved_quantity: '2', organization_id: id }],
        },
      }),
    ).toThrow();
    expect(() =>
      parseOperationCommand({
        ...command,
        input: {
          ...command.input,
          items: Array(101).fill(command.input.items[0]),
        },
      }),
    ).toThrow();
  });
});
