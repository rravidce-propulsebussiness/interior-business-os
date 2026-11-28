import { describe, expect, it } from 'vitest';
import { filterSharedQuotations } from './sharing-filter';

describe('Quotation sharing metadata outages', () => {
  const rows = [{ id: 'shared' }, { id: 'saved' }];
  it('keeps authenticated search results visible when sharing lookup fails', () => {
    expect(filterSharedQuotations(rows, true, false, new Set())).toEqual(rows);
  });
  it('filters only when the sharing result is known', () => {
    expect(
      filterSharedQuotations(rows, true, true, new Set(['shared'])),
    ).toEqual([{ id: 'shared' }]);
    expect(filterSharedQuotations(rows, true, true, new Set())).toEqual([]);
  });
  it('keeps saved and shared revisions together on All', () => {
    expect(
      filterSharedQuotations(rows, false, true, new Set(['shared'])),
    ).toEqual(rows);
  });
});
