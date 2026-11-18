/**
 * Serialises writes for each industry and preserves edits made while a save is
 * in flight. A newer revision is saved only after the previous request settles,
 * so an older server response cannot overwrite newer changes.
 */
export type AutosaveStatus = {
  phase: 'saved' | 'pending' | 'saving' | 'error';
  message?: string;
};

export function createWorkflowAutosave<T>({
  initial,
  validate,
  persist,
  onStatus,
  onCommitted,
  delayMs = 700,
}: {
  initial: Record<string, T>;
  validate: (rows: T) => string | null;
  persist: (
    industry: string,
    rows: T,
  ) => Promise<{ ok: boolean; rows?: T; message?: string }>;
  onStatus: (industry: string, status: AutosaveStatus) => void;
  onCommitted: (industry: string, rows: T) => void;
  delayMs?: number;
}) {
  const drafts = new Map<string, T>(Object.entries(initial));
  const confirmed = new Map<string, T>(Object.entries(initial));
  const versions = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Set<string>();
  let disposed = false;

  const changed = (industry: string) =>
    drafts.has(industry) &&
    (!confirmed.has(industry) ||
      JSON.stringify(drafts.get(industry)) !==
        JSON.stringify(confirmed.get(industry)));

  const cancel = (industry: string) => {
    const timer = timers.get(industry);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(industry);
  };

  const schedule = (industry: string, delay: number) => {
    if (disposed) return;
    cancel(industry);
    timers.set(
      industry,
      setTimeout(() => {
        timers.delete(industry);
        void flush(industry);
      }, delay),
    );
  };

  const change = (industry: string, rows: T, delay = delayMs) => {
    if (disposed) return;
    drafts.set(industry, rows);
    versions.set(industry, (versions.get(industry) ?? 0) + 1);
    cancel(industry);
    if (!changed(industry)) {
      onStatus(industry, { phase: 'saved' });
      return;
    }
    onStatus(industry, { phase: 'pending' });
    schedule(industry, delay);
  };

  const flush = async (industry: string): Promise<void> => {
    cancel(industry);
    if (disposed || inflight.has(industry) || !changed(industry)) return;
    const rows = drafts.get(industry);
    if (rows === undefined) return;
    const issue = validate(rows);
    if (issue) {
      onStatus(industry, { phase: 'error', message: issue });
      return;
    }
    const revision = versions.get(industry) ?? 0;
    inflight.add(industry);
    onStatus(industry, { phase: 'saving' });
    try {
      const result = await persist(industry, rows);
      if (disposed) return;
      if (result.ok) {
        const saved = result.rows ?? rows;
        confirmed.set(industry, saved);
        if (versions.get(industry) === revision) {
          drafts.set(industry, saved);
          onCommitted(industry, saved);
          onStatus(industry, { phase: 'saved' });
        } else {
          onStatus(industry, { phase: 'pending' });
        }
      } else {
        onStatus(industry, {
          phase: 'error',
          message: result.message ?? 'Could not save workflow changes.',
        });
      }
    } catch {
      if (!disposed)
        onStatus(industry, {
          phase: 'error',
          message: 'Connection problem. Retry saving your changes.',
        });
    } finally {
      inflight.delete(industry);
      // Never send concurrent writes to the same industry.
      if (!disposed && versions.get(industry) !== revision && changed(industry))
        schedule(industry, 0);
    }
  };

  const dispose = () => {
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
  // React Strict Mode replays effects in development; the controller must be
  // usable again after that effect cleanup without losing queued edits.
  const activate = () => {
    disposed = false;
    for (const industry of drafts.keys())
      if (changed(industry) && !inflight.has(industry))
        schedule(industry, delayMs);
  };

  return {
    activate,
    change,
    flush,
    getDraft: (industry: string) => drafts.get(industry),
    hasPending: () =>
      [...drafts.keys()].some((industry) => changed(industry)) ||
      inflight.size > 0,
    dispose,
  };
}
