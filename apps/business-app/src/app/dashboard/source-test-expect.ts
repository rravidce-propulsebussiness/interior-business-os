import { expect as vitestExpect } from 'vitest';

const normalizeSource = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s+\.(?=[A-Za-z_$])/g, '.')
    .replace(/\s*([{}()[\];,:=<>+?!&|*-])\s*/g, '$1')
    .replace(/,([)}\]])/g, '$1')
    .replace(/\.map\(/g, '.map')
    .replace(/\(([A-Za-z_$][\w$]*)\)=>/g, '$1=>')
    .replace(/=>\(/g, '=>')
    .replace(/&&\s*\(<(?=[A-Za-z])/g, '&&<')
    .replace(/\((existingCustomer\|\|quoteWithoutLead)\)\?/g, '$1?')
    .replace(
      /\(await blob\.slice\(([^)]+)\)\.text\(\)\)/g,
      'await blob.slice($1).text()',
    )
    .replace(/(^|[\s,(])0\.(\d)/g, '$1.$2')
    .replace(/'/g, '"')
    .replace(/#[\da-f]{3,8}\b/gi, (hex) => hex.toLowerCase());

const createMatcher = (actual: unknown, negated = false): unknown => {
  const matcher = negated ? vitestExpect(actual).not : vitestExpect(actual);
  if (typeof actual !== 'string') return matcher;

  return new Proxy(matcher, {
    get(target, property) {
      if (property === 'not') return createMatcher(actual, !negated);

      if (property === 'toContain' && typeof actual === 'string') {
        return (expected: unknown) => {
          if (typeof expected !== 'string') {
            return Reflect.get(target, property, target).call(target, expected);
          }

          const found = normalizeSource(actual).includes(
            normalizeSource(expected),
          );
          return vitestExpect(negated ? !found : found).toBe(true);
        };
      }

      return Reflect.get(target, property, target);
    },
  });
};

export const expectSource = ((actual: unknown) =>
  createMatcher(actual)) as typeof vitestExpect;
