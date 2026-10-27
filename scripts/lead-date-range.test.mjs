import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leadDateBounds,
  leadDateRangeSelection,
} from '../apps/business-app/src/app/dashboard/crm/leads/date-range.ts';

const now = new Date('2026-10-15T20:00:00.000Z'); // 16 Oct in Hyderabad, 15 Oct UTC

test('calendar presets use organization-local dates, not rolling 7/30 days', () => {
  assert.deepEqual(
    leadDateBounds({ range: 'last_week' }, 'Asia/Kolkata', now),
    { from: '2026-10-05', until: '2026-10-11' },
  );
  assert.deepEqual(
    leadDateBounds({ range: 'last_month' }, 'Asia/Kolkata', now),
    { from: '2026-09-01', until: '2026-09-30' },
  );
  assert.deepEqual(
    leadDateBounds({ range: 'this_month' }, 'Asia/Kolkata', now),
    { from: '2026-10-01', until: '2026-10-16' },
  );
});

test('date range handles a calendar-year boundary and the tenant timezone', () => {
  const january = new Date('2026-12-31T20:00:00.000Z'); // Jan 1 India
  assert.deepEqual(
    leadDateBounds({ range: 'last_month' }, 'Asia/Kolkata', january),
    { from: '2026-12-01', until: '2026-12-31' },
  );
  assert.deepEqual(
    leadDateBounds({ range: 'this_month' }, 'Asia/Kolkata', january),
    { from: '2027-01-01', until: '2027-01-01' },
  );
  assert.deepEqual(leadDateBounds({ range: 'this_month' }, 'UTC', january), {
    from: '2026-12-01',
    until: '2026-12-31',
  });
});

test('custom range remains optional, validates dates, and supports saved legacy links', () => {
  assert.equal(leadDateRangeSelection({ from: '2026-10-01' }), 'custom');
  assert.deepEqual(
    leadDateBounds(
      { range: 'custom', from: '2026-10-01', until: '2026-10-15' },
      'Asia/Kolkata',
      now,
    ),
    { from: '2026-10-01', until: '2026-10-15' },
  );
  assert.deepEqual(
    leadDateBounds(
      { range: 'custom', from: '2026-02-30', until: '2026-03-01' },
      'Asia/Kolkata',
      now,
    ),
    { until: '2026-03-01' },
  );
  assert.deepEqual(
    leadDateBounds(
      { range: 'custom', from: '2026-10-22', until: '2026-10-01' },
      'Asia/Kolkata',
      now,
    ),
    {},
  );
  assert.deepEqual(leadDateBounds({}, 'Asia/Kolkata', now), {});
  // A previously saved custom link stays custom, but preset options override stale dates.
  assert.deepEqual(
    leadDateBounds(
      { range: 'last_week', from: '2020-01-01' },
      'Asia/Kolkata',
      now,
    ),
    { from: '2026-10-05', until: '2026-10-11' },
  );
});
