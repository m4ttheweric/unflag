import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule, { relativeTo } from './no-raw-config-reads';

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const options = [
  {
    restricted: [
      { importSource: '@islands/utils/useFeatureFlags' },
      { objectPattern: 'tenantConfig.features' },
    ],
    allowIn: ['**/*.features.ts', '**/features/**'],
  },
];

describe('no-raw-config-reads', () => {
  it('enforces import and member restrictions outside allowIn', () => {
    tester.run('no-raw-config-reads', rule, {
      valid: [
        {
          filename: '/repo/src/auto.features.ts',
          code: `import { useFeatureFlags } from '@islands/utils/useFeatureFlags';`,
          options,
        },
        {
          filename: '/repo/src/features/chat.ts',
          code: `const surface = tenantConfig.features.chatSurface;`,
          options,
        },
        {
          filename: '/repo/src/components/Header.tsx',
          code: `import { useFeatures } from './autoFeatures.react';`,
          options,
        },
        {
          filename: '/repo/src/components/Header.tsx',
          code: `const x = tenantConfig.tenant;`,
          options,
        },
      ],
      invalid: [
        {
          filename: '/repo/src/components/Header.tsx',
          code: `import { useFeatureFlags } from '@islands/utils/useFeatureFlags';`,
          options,
          errors: [{ messageId: 'rawImport' }],
        },
        {
          filename: '/repo/src/components/Header.tsx',
          code: `const surface = tenantConfig.features.chatSurface;`,
          options,
          errors: [{ messageId: 'rawMemberAccess' }],
        },
        {
          filename: '/repo/src/components/Header.tsx',
          code: `const f = tenantConfig.features;`,
          options,
          errors: [{ messageId: 'rawMemberAccess' }],
        },
      ],
    });
  });
});

describe('relativeTo', () => {
  it('strips a cwd without a trailing slash', () => {
    expect(relativeTo('/repo', '/repo/src/foo.ts')).toBe('src/foo.ts');
  });

  it('strips a cwd with a trailing slash without double-counting the separator', () => {
    expect(relativeTo('/repo/', '/repo/src/foo.ts')).toBe('src/foo.ts');
  });

  it('handles a root cwd of "/" without dropping the first path character', () => {
    expect(relativeTo('/', '/repo/src/foo.ts')).toBe('repo/src/foo.ts');
  });

  it('does not treat a sibling directory sharing a prefix as inside cwd', () => {
    expect(relativeTo('/repo', '/repository/src/foo.ts')).toBe('/repository/src/foo.ts');
  });

  it('falls back to the absolute filename when it does not share the cwd prefix at all', () => {
    expect(relativeTo('/repo', '/other/src/foo.ts')).toBe('/other/src/foo.ts');
  });
});

describe('no-raw-config-reads schema validation', () => {
  it('rejects a malformed restricted entry at the schema level instead of crashing at runtime', () => {
    const linter = new Linter();
    const config: Linter.Config[] = [
      {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { unflag: { rules: { 'no-raw-config-reads': rule } } },
        rules: {
          'unflag/no-raw-config-reads': ['error', { restricted: ['not-an-object'] }],
        },
      },
    ];

    expect(() => linter.verify('const x = 1;', config, { filename: 'src/x.js' })).toThrow(
      /should be object|should match exactly one schema/,
    );
  });
});
