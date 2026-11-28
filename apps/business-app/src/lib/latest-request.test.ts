import { describe, expect, it } from 'vitest';
import { createLatestRequest } from './latest-request';

describe('WhatsApp refresh races', () => {
  it('lets a slow foreground load finish while repeated polling ticks skip it', () => {
    const requests = createLatestRequest();
    const foreground = requests.start()!;
    for (let tick = 0; tick < 10; tick++)
      expect(requests.start(true)).toBeNull();
    expect(requests.isCurrent(foreground)).toBe(true);
    expect(requests.finish(foreground)).toBe(true);
    expect(requests.start(true)).not.toBeNull();
  });

  it('ignores an old search response and its cleanup after a newer result', async () => {
    const requests = createLatestRequest();
    const old = requests.start()!;
    const current = requests.start()!;
    const results: string[] = [];
    // Network bodies can finish after abort; identity guards are still needed.
    await Promise.resolve().then(() => {
      if (requests.isCurrent(current)) results.push('new search');
      expect(requests.finish(current)).toBe(true);
    });
    if (requests.isCurrent(old)) results.push('old search');
    expect(requests.finish(old)).toBe(false);
    expect(old.signal.aborted).toBe(true);
    expect(results).toEqual(['new search']);
  });

  it('invalidates pending updates when a number or company is unmounted', () => {
    const requests = createLatestRequest();
    const old = requests.start()!;
    requests.cancel();
    expect(old.signal.aborted).toBe(true);
    expect(requests.isCurrent(old)).toBe(false);
    expect(requests.finish(old)).toBe(false);
    expect(requests.start()).not.toBeNull();
  });
});
