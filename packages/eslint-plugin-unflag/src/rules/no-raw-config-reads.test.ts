import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-raw-config-reads';

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
