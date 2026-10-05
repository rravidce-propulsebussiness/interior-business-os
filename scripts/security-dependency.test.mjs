import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = createRequire(import.meta.url);
const next = createRequire(root.resolve('eslint-config-next'));
const plugin = createRequire(next.resolve('@next/eslint-plugin-next'));
const glob = createRequire(plugin.resolve('fast-glob'));
const match = createRequire(glob.resolve('micromatch'));
const braces = match('braces');
const micromatch = glob('micromatch');
const fastGlob = plugin('fast-glob');

test('the real lint dependency rejects the advisory nested-pattern reproduction with a bounded error', () => {
  const attack = '{'.repeat(4000) + 'x,y' + '}'.repeat(4000);
  for (const expand of [false, true])
    assert.throws(
      () => braces(attack, { expand }),
      (error) =>
        error.code === 'ERR_BRACES_AST_LIMIT' &&
        !/Maximum call stack/.test(error.message),
    );
});
test('preparsed ASTs cannot bypass compile or expand depth protection', () => {
  const ast = braces.parse('{'.repeat(4000) + 'x' + '}'.repeat(4000));
  assert.throws(() => braces.compile(ast), { code: 'ERR_BRACES_AST_LIMIT' });
  assert.throws(() => braces.expand(ast), { code: 'ERR_BRACES_AST_LIMIT' });
});
test('normal brace expansion, micromatch and actual repository globs retain expected behavior', async () => {
  assert.deepEqual(
    braces.expand(
      'apps/{business-app,platform-admin}/src/{login,register}.tsx',
    ),
    [
      'apps/business-app/src/login.tsx',
      'apps/business-app/src/register.tsx',
      'apps/platform-admin/src/login.tsx',
      'apps/platform-admin/src/register.tsx',
    ],
  );
  assert.deepEqual(micromatch(['a.ts', 'b.tsx', 'c.js'], '*.{ts,tsx}'), [
    'a.ts',
    'b.tsx',
  ]);
  const files = await fastGlob(
    'apps/{business-app,platform-admin}/src/app/{login,register}/page.tsx',
  );
  assert.equal(files.length, 3);
});
