import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('construction quotation editor regressions', () => {
  const builder = source('./premium-sft-builder.tsx');
  const selector = source('./construction-selector.tsx');
  const actions = source('./construction-actions.ts');

  it('opens only the chosen material card with its original index', () => {
    expect(builder).toContain('onClick={() => openMaterials(index)}');
    expect(builder).toContain(
      'editingMaterialIndex === null || editingMaterialIndex === i',
    );
    expect(builder).toContain('open={editingMaterialIndex === i}');
    expect(builder).toContain('setEditingMaterialIndex(null)');
  });

  it('supports all 31 specifications instead of truncating new packages to 18', () => {
    expect(builder).toContain('].slice(0, 32)');
    expect(builder).toContain('configured.length < 32');
    expect(builder).not.toContain('].slice(0, 18)');
  });

  it('reopens existing quotations even after company packages are deleted', () => {
    expect(selector).toContain('initialConstructionPackageSelection(');
    expect(selector).toContain('selected === SAVED_PACKAGE_OPTION');
    expect(selector).toContain('initialSchedule?.package?.id');
    expect(builder).toContain(
      'initialSchedule?.package?.id === selectedPackageId',
    );
  });

  it('verifies archived package identity against the existing tenant-owned revision', () => {
    expect(actions).toContain(".select('id,description')");
    expect(actions).toContain(".eq('organization_id', s.org)");
    expect(actions).toContain(".eq('revision_id', rid)");
    expect(actions).toContain(
      'originalPackage?.id === parsed.packageId',
    );
    expect(actions).toContain(
      'if (parsed.packageId && !selectedPackage && !archivedPackage)',
    );
  });
});
