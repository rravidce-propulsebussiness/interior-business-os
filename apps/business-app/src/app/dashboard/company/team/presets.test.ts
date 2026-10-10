import { describe, expect, it } from 'vitest';
import { getRolePreset, rolePresets } from './presets';

describe('editable employee role presets', () => {
  it('provides unique industry-neutral keys for all required employee categories', () => {
    expect(new Set(rolePresets.map((role) => role.key)).size).toBe(
      rolePresets.length,
    );
    for (const key of [
      'marketing',
      'customer_support',
      'quotation_preparer',
      'site_engineer',
      'project_manager_limited',
      'site_supervisor_limited',
      'watchman',
      'carpenter',
      'interior_designer_limited',
      'accountant_limited',
    ]) {
      expect(getRolePreset(key)).toBeDefined();
    }
  });
  it('never grants security and on-site workers company finance or hidden cost authority', () => {
    for (const key of [
      'watchman',
      'carpenter',
      'site_engineer',
      'site_supervisor_limited',
    ]) {
      const preset = getRolePreset(key);
      expect(preset).toBeDefined();
      expect(preset?.industries).toContain('construction');
      expect(preset?.industries).toContain('interior');
      expect(
        preset?.permissions.every(
          (permission) =>
            !/^(billing|payment|report\.financial|quotation\.view_internal_cost|pricing|purchase|role\.|team\.)/.test(
              permission,
            ),
        ),
      ).toBe(true);
    }
  });
  it('uses only explicit canonical permission keys and never wildcard grants', () => {
    for (const preset of rolePresets) {
      expect(preset.permissions.length).toBeGreaterThan(0);
      for (const permission of preset.permissions) {
        expect(permission).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/);
        expect(permission).not.toContain('*');
      }
    }
  });
});
