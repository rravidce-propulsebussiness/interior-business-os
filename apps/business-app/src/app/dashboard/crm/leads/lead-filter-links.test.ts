import { describe, expect, it } from 'vitest';
import { allLeadsHref } from './lead-filter-links';

describe('CRM Leads filter reset', () => {
  it('returns to every lead from a filtered stage on desktop list', () => {
    const url = new URL(allLeadsHref('list'), 'https://sghomesinterior.in');
    expect(url.pathname).toBe('/dashboard/crm/leads');
    expect(url.search).toBe('');
    expect(url.searchParams.has('stage_id')).toBe(false);
  });
  it('preserves board view but clears all filtering', () => {
    const url = new URL(allLeadsHref('board'), 'https://sghomesinterior.in');
    expect(url.searchParams.get('view')).toBe('board');
    expect(url.searchParams.has('stage_id')).toBe(false);
    expect(url.searchParams.has('priority')).toBe(false);
    expect(url.searchParams.has('q')).toBe(false);
  });
});
