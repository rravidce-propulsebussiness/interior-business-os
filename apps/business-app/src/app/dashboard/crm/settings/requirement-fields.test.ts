import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mapRequirementField,
  requirementKey,
  quickRequirementFields,
  type QuickRequirementField,
} from '../requirement-fields';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
describe('Removed lead field settings preserve existing Leads functionality', () => {
  const page = read('./page.tsx');
  const lead = read('../leads/quick-add-lead.tsx');
  const action = read('../leads/quick-add-action.ts');
  it('does not expose custom requirement configuration in Settings or Leads navigation', () => {
    const settings = read('../../settings/page.tsx');
    const sidebar = read('../../owner-workspace-navigation.ts');
    const leadsNav = read('../../leads-navigation.ts');
    expect(settings).not.toContain('Lead Requirement Fields');
    expect(settings).not.toContain('lead-fields');
    expect(settings).not.toContain('RequirementFieldsWorkspace');
    expect(settings).not.toContain("crm.crm.search('crm_requirement_fields'");
    expect(page).toContain("redirect('/dashboard/crm/leads')");
    expect(page).not.toContain('RequirementFieldsWorkspace');
    expect(sidebar).not.toContain('Lead Settings');
    expect(leadsNav).not.toContain('Lead Settings');
  });
  it('keeps the original CSV import workflow and lead requirement values', () => {
    const importAction = read('../leads/import/actions.ts');
    const importForm = read('../leads/import/sheet-import-form.tsx');
    expect(importAction).toContain('service_type: data.requirement');
    expect(importForm).toContain("'Requirement'");
    expect(importForm).toContain("get('requirement')");
  });
  it('uses same fields in original Add Lead form and validates on the server', () => {
    expect(lead).toContain('quickRequirementFields(requirementFields,service)');
    expect(lead).toContain('extraRequirements:Object.fromEntries');
    expect(action).toContain('s.crm.search(');
    expect(action).toContain("'crm_requirement_fields',{active:true}");
    expect(action).toContain('if(field.required)return');
    expect(action).toContain('field.options.includes(answer)');
    expect(action).toContain('Object.assign(requirements,validExtra)');
  });
  it('never repeats questions the original Add Lead form already contains', () => {
    const base = {
      id: 'id',
      version: 1,
      industryId: null,
      sortOrder: 0,
      active: true,
      required: true,
      options: [],
      fieldType: 'text' as const,
    };
    const fields: QuickRequirementField[] = [
      {
        ...base,
        key: 'plot_area_sq_yards',
        name: 'Plot area',
        service: 'construction',
      },
      {
        ...base,
        key: 'site_road_width',
        name: 'Road width',
        service: 'construction',
      },
      {
        ...base,
        key: 'site_road_width',
        name: 'Road width duplicate',
        service: 'construction',
      },
      {
        ...base,
        key: 'interior_material_choice',
        name: 'Material',
        service: 'interior',
      },
      { ...base, key: 'common_note', name: 'Common note', service: null },
      {
        ...base,
        key: 'hidden',
        name: 'Inactive',
        active: false,
        service: null,
      },
    ];
    expect(
      quickRequirementFields(fields, 'construction').map((item) => item.key),
    ).toEqual(['site_road_width', 'common_note']);
    expect(
      quickRequirementFields(fields, 'interior').map((item) => item.key),
    ).toEqual(['interior_material_choice', 'common_note']);
  });
  it('keeps stable names and dropdown data intact for existing fields', () => {
    const mapped = mapRequirementField({
      id: 'abc',
      version: 3,
      key: 'number_of_floors',
      name: 'Number of Floors',
      industry_id: null,
      field_type: 'select',
      options: ['Ground', 'G+1', 'G+2'],
      required: true,
      sort_order: 4,
      active: false,
    });
    expect(mapped).toMatchObject({
      version: 3,
      key: 'number_of_floors',
      fieldType: 'select',
      required: true,
      active: false,
      options: ['Ground', 'G+1', 'G+2'],
    });
    expect(requirementKey('Number of Floors')).toBe('number_of_floors');
  });
});
