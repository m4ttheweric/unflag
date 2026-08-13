# eslint-plugin-unflag

```
pnpm add -D @m4ttheweric/eslint-plugin-unflag
```

```js
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
```

`@m4ttheweric/eslint-plugin-unflag` ships one rule, `unflag/no-raw-config-reads`, that
restricts raw config imports/reads to the modules you allow (typically the
`*.features.ts` files and nothing else), so a stray `flags['some-flag']` read
or raw config import creeping into a component gets caught by the linter
instead of a reviewer. `restricted` entries are either `{ importSource }`
(bans an import specifier) or `{ objectPattern }` (bans a dotted
member-access chain, e.g. `window.__FLAGS__.foo`); `allowIn` is a picomatch
glob allowlist, defaulting to `['**/*.features.ts', '**/features/**']` when
omitted.

See [`@m4ttheweric/unflag`](https://github.com/m4ttheweric/unflag/tree/main/packages/unflag)
for the library this rule enforces.
