import { describe, expect, it } from 'vitest';
import { displayProjectCode, displayReference } from './project-display';

describe('project display helpers', () => {
  it('hides generated hash project codes and keeps real codes', () => {
    expect(displayProjectCode('Q0D0D5C281BFE42DFA5C1FD8155C44EEC')).toBe('');
    expect(displayProjectCode('PRJ-2026-0007')).toBe('PRJ-2026-0007');
    expect(displayProjectCode(null)).toBe('');
  });

  it('drops storage ids from drawing references', () => {
    expect(
      displayReference(
        'E2E-PLAN-4 — plan.pdf [41b3788e-5fa5-404f-8cbe-cfc06b720e86]',
      ),
    ).toBe('E2E-PLAN-4 — plan.pdf');
    expect(displayReference('A-101 rev 2')).toBe('A-101 rev 2');
  });
});
