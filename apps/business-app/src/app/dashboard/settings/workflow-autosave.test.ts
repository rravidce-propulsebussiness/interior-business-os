import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowAutosave } from './workflow-autosave';

describe('workflow autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const statuses: string[] = [];
    const commits: { key: string; value: number }[] = [];
    const persist = vi.fn(async (_key: string, rows: { value: number }) => ({
      ok: true,
      rows,
    }));
    const controller = createWorkflowAutosave({
      initial: { construction: { value: 0 }, interior: { value: 0 } },
      validate: (rows) => (rows.value < 0 ? 'Invalid value' : null),
      persist,
      onStatus: (key, state) => statuses.push(key + ':' + state.phase),
      onCommitted: (key, rows) => commits.push({ key, value: rows.value }),
      delayMs: 700,
    });
    return { controller, persist, statuses, commits };
  };

  it('debounces typing and confirms only a completed save', async () => {
    const { controller, persist, statuses } = setup();
    controller.change('construction', { value: 1 });
    await vi.advanceTimersByTimeAsync(450);
    controller.change('construction', { value: 2 });
    await vi.advanceTimersByTimeAsync(699);
    expect(persist).not.toHaveBeenCalled();
    expect(controller.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith('construction', {
      value: 2,
    });
    expect(controller.hasPending()).toBe(false);
    expect(statuses.at(-1)).toBe('construction:saved');
    controller.dispose();
  });

  it('saves Add item immediately when flushed', async () => {
    const { controller, persist } = setup();
    controller.change('construction', { value: 1 }, 0);
    await controller.flush('construction');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.hasPending()).toBe(false);
    controller.dispose();
  });

  it('keeps edits in separate industries when switching before save', async () => {
    const { controller, persist } = setup();
    controller.change('construction', { value: 3 });
    await controller.flush('construction');
    controller.change('interior', { value: 4 }, 0);
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenNthCalledWith(1, 'construction', { value: 3 });
    expect(persist).toHaveBeenNthCalledWith(2, 'interior', { value: 4 });
    expect(controller.getDraft('construction')).toEqual({ value: 3 });
    expect(controller.getDraft('interior')).toEqual({ value: 4 });
    controller.dispose();
  });

  it('serializes requests and never overwrites edits made during a save', async () => {
    let release!: (result: { ok: true; rows: { value: number } }) => void;
    const persist = vi.fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: true; rows: { value: number } }>((resolve) => {
            release = resolve;
          }),
      )
      .mockImplementationOnce(async (_key: string, rows: { value: number }) => ({
        ok: true,
        rows,
      }));
    const commits: number[] = [];
    const controller = createWorkflowAutosave({
      initial: { construction: { value: 0 } },
      validate: () => null,
      persist,
      onStatus: () => undefined,
      onCommitted: (_key, rows) => commits.push(rows.value),
      delayMs: 700,
    });
    controller.change('construction', { value: 1 }, 0);
    await vi.runOnlyPendingTimersAsync();
    controller.change('construction', { value: 2 }, 0);
    await vi.runOnlyPendingTimersAsync();
    expect(persist).toHaveBeenCalledTimes(1);
    release({ ok: true, rows: { value: 1 } });
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenNthCalledWith(2, 'construction', {
      value: 2,
    });
    expect(commits).toEqual([2]);
    expect(controller.getDraft('construction')).toEqual({ value: 2 });
    expect(controller.hasPending()).toBe(false);
    controller.dispose();
  });

  it('preserves failed and invalid drafts for repair and retry', async () => {
    const { controller, persist, statuses } = setup();
    controller.change('construction', { value: -1 }, 0);
    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe('construction:error');
    expect(controller.hasPending()).toBe(true);

    persist.mockResolvedValueOnce({ ok: false, message: 'Rejected' });
    controller.change('construction', { value: 7 }, 0);
    await vi.runAllTimersAsync();
    expect(controller.hasPending()).toBe(true);
    expect(statuses.at(-1)).toBe('construction:error');
    await controller.flush('construction');
    expect(statuses.at(-1)).toBe('construction:saved');
    expect(controller.hasPending()).toBe(false);
    controller.dispose();
  });

  it('clears scheduled work on unmount and can activate after strict-effect replay', async () => {
    const { controller, persist } = setup();
    controller.change('interior', { value: 5 });
    controller.dispose();
    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();
    controller.activate();
    await vi.advanceTimersByTimeAsync(700);
    expect(persist).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
