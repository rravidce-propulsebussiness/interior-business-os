import { expect } from 'vitest';

// Source-contract checks must survive formatting without dropping their tokens.
const compact = (source: string) =>
  source
    .replace(/\s/g, '')
    .replace(/,(?=[)\]}])/g, '')
    .replace(/\(([A-Za-z_$][\w$]*)\)=>/g, '$1=>');
export function expectSource(source: string) {
  return {
    toContain(expected: string) {
      expect(compact(source)).toContain(compact(expected));
    },
    not: {
      toContain(expected: string) {
        expect(compact(source)).not.toContain(compact(expected));
      },
    },
  };
}
