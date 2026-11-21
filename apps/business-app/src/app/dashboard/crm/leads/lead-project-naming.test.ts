import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverAction = readFileSync(
  new URL('./lead-project-actions.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../../../../../../../packages/database/supabase/migrations/20261121150000_won_lead_project_names.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Won lead project naming', () => {
  it('uses the actual lead name, not its preexisting quotation placeholder', () => {
    expect(serverAction).toContain('const projectName = lead.name.trim()');
    expect(serverAction).toContain('project_name: projectName');
    expect(serverAction).not.toContain('projectName = existing.data.name');
  });

  it('renames only automatically generated quotation titles on conversion', () => {
    expect(migration).toContain("p.name like 'Quotation · %'");
    expect(migration).toContain('p.customer_id = new.converted_customer_id');
    expect(migration).toContain(
      'new.converted_project_id is distinct from old.converted_project_id',
    );
    expect(migration).toContain('p.removed_from_workspace = false');
  });

  it('repairs historical placeholder titles without renaming deliberately titled projects', () => {
    expect(migration).toContain('having count(*) = 1');
    expect(migration).toContain('set name = converted.lead_name');
    expect(migration).toContain("where p.name like 'Quotation · %'");
  });
});
