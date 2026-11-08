import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');
const page = read('./page.tsx');
const nav = read('../../owner-workspace-navigation.ts');
const operation = read('../../operations/service.ts');
describe('permission-safe project task board', () => {
  it('reuses canonical Operations task RPCs with tenant permission checks', () => {
    expect(page).toContain("operationsServices('task.view', true)");
    expect(page).toContain("s.allowed('execution.view')");
    expect(page).toContain('notFound()');
    expect(page).toContain(
      "s.operations.search('project_tasks', { project_id: project }, page)",
    );
    expect(page).toContain("s.operations.options('projects'");
    expect(page).toContain('z.uuid().safeParse');
    expect(operation).toContain('canUseOperations(context, permission)');
    expect(page).not.toContain("from('project_tasks')");
  });
  it('does not create a second mutable task ledger', () => {
    expect(page).toContain('/dashboard/operations/project_tasks/');
    expect(page).toContain('/dashboard/operations/command/save_project_tasks');
    expect(page).toContain("s.allowed('task.manage')");
    expect(page).not.toContain('.update(');
    expect(page).not.toContain('.insert(');
  });
  it('shows the board under the permission-gated navigation group', () => {
    expect(nav).toContain("has('task.view', 'projects')");
    expect(nav).toContain("href: '/dashboard/project-management/tasks'");
    expect(page).toContain('currentHref="/dashboard/project-management/tasks"');
  });
});
