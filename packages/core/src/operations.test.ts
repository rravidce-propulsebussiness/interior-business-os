import { describe, expect, it } from 'vitest';
import {
  operationsEntitySchema,
  operationsFilterSchema,
  operationsModules,
} from './operations';
describe('operations trust boundaries', () => {
  it('rejects unrelated tables and unsafe search keys', () => {
    expect(operationsEntitySchema.safeParse('contracts').success).toBe(false);
    expect(
      operationsEntitySchema.safeParse('inventory_movements').success,
    ).toBe(true);
    expect(
      operationsFilterSchema.safeParse({ organization_id: 'forged' }).success,
    ).toBe(false);
  });
  it('requires procurement and vendor entitlements independently', () => {
    expect(operationsModules('inventory.consume')).toEqual([
      'projects',
      'purchasing',
    ]);
    expect(operationsModules('material_issue.request')).toEqual([
      'projects',
      'purchasing',
    ]);
    expect(operationsModules('work_order.approve')).toEqual([
      'projects',
      'vendors',
    ]);
    expect(operationsModules('task.manage')).toEqual(['projects']);
  });
});
