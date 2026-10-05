import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
export default defineConfig([
  ...next,
  ...ts,
  prettier,
  globalIgnores([
    '.pnpm-store/**',
    '.tools/**',
    '**/.next/**',
    '**/.next-recovery/**',
    '**/next-env.d.ts',
    '**/node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    settings: { next: { rootDir: ['apps/*/'] } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/apps/**', '@business-os/*/src/*'] },
      ],
    },
  },
  {
    files: [
      'packages/{core,quotation-engine,website-builder,brochure-builder,industry-interior,shared}/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react/*',
            'next',
            'next/*',
            '@supabase/*',
            '@business-os/database',
            '@business-os/ui',
            '**/apps/**',
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/{core,quotation-engine,website-builder,brochure-builder,shared}/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react/*',
            'next',
            'next/*',
            '@supabase/*',
            '@business-os/database',
            '@business-os/ui',
            '@business-os/industry-*',
            '**/apps/**',
          ],
        },
      ],
    },
  },
]);
