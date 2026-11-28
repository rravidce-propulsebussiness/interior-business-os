/** Coordinate refreshes without letting a slow, obsolete reply overwrite UI. */
export function createLatestRequest() {
  let current: AbortController | null = null;
  return {
    start(quiet = false): AbortController | null {
      // A polling refresh must not cancel a slower foreground request every
      // four seconds and leave the screen permanently loading.
      if (quiet && current) return null;
      current?.abort();
      current = new AbortController();
      return current;
    },
    isCurrent(request: AbortController) {
      return current === request && !request.signal.aborted;
    },
    finish(request: AbortController) {
      if (current !== request) return false;
      current = null;
      return !request.signal.aborted;
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}
