import tseslint from 'typescript-eslint';
import unflag from '@m4ttheweric/eslint-plugin-unflag';

export default tseslint.config({
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { unflag },
  rules: {
    'unflag/no-raw-config-reads': ['error', {
      restricted: [{ importSource: '../rawConfig' }, { importSource: './rawConfig' }],
      allowIn: ['**/features/**', '**/App.tsx', '**/rawConfig.ts'],
    }],
  },
});
