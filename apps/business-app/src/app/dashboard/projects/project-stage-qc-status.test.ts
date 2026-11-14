import { describe, expect, it } from 'vitest';
import { displayStageQcStatus } from './project-stage-qc-status';

const passed = (
  index: number,
  decision = 'passed',
  reviewed_at = '2026-11-14',
) => ({
  id: String(index) + decision + reviewed_at,
  index,
  decision,
  reviewed_at,
});

describe('milestone QC status', () => {
  it('shows QC Passed after every current item review passes', () => {
    expect(
      displayStageQcStatus(
        'ready_for_qc',
        ['Footings', 'Columns'],
        [passed(0), passed(1)],
      ),
    ).toBe('qc_passed');
  });

  it('keeps QC pending until every topic passes and respects the latest review', () => {
    expect(
      displayStageQcStatus(
        'ready_for_qc',
        ['Footings', 'Columns'],
        [passed(0)],
      ),
    ).toBe('ready_for_qc');
    expect(
      displayStageQcStatus(
        'ready_for_qc',
        ['Footings'],
        [passed(0), passed(0, 'failed', '2026-11-15')],
      ),
    ).toBe('ready_for_qc');
  });

  it('does not replace formal certification or report early QC as a final pass', () => {
    expect(displayStageQcStatus('certified', ['Footings'], [passed(0)])).toBe(
      'certified',
    );
    expect(displayStageQcStatus('in_progress', ['Footings'], [passed(0)])).toBe(
      'in_progress',
    );
  });
});
