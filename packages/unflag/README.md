<p align="center"><img src="./unflag_logo_small.png" width="160" alt="unflag logo" /></p>

# unflag

<p align="center">Config in, typed product state out.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@m4ttheweric/unflag"><img src="https://img.shields.io/npm/v/%40m4ttheweric%2Funflag?label=%40m4ttheweric%2Funflag" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@m4ttheweric/eslint-plugin-unflag"><img src="https://img.shields.io/npm/v/%40m4ttheweric%2Feslint-plugin-unflag?label=eslint-plugin-unflag" alt="npm" /></a>
</p>

---

## What it does

Feature flags leak into app code as reads like this:

```ts
// is chat on? hard to say.
const showChat =
  flags['ticket-chat-rollout'] && !flags['ticket-chat-bot-variant'];
```

Flag names are cryptic. Kill switches invert their meaning. Every component that reads a flag has to know all of this. Over time, no one can say what the product does by reading the code.

unflag puts a wall between raw config and your components. Flags go in one side. A typed, validated set of **features** comes out the other:

```ts
const features = useFeatures();
features.ticketChat; // 'agent-chat' | 'bot-chat' | 'disabled'
```

## Features

- **Types that speak product.** Features are named values with real types, checked by [zod](https://zod.dev) schemas. Not booleans with ticket numbers in their names.
- **Enforcement.** An eslint rule turns the wall into a build error. App code that reads raw config outside your feature files fails lint.
- **Answers to "why is this on?"** Every feature records which inputs it read. `explain()` prints it. A dev panel shows it live in the browser, and lets you override any feature while you test.
- **Easy tests.** A builder makes a full feature state from one baseline, so each test only sets the fields it cares about.

## Installation

```bash
pnpm add @m4ttheweric/unflag zod
pnpm add -D @m4ttheweric/eslint-plugin-unflag   # optional, for the lint rule
```

You need `zod >= 3.25`. The React parts need `react >= 18`.

## Usage

**Step 1: define your features.** Do this in one file, next to the raw config it reads. Each feature says what it reads, what shape it returns, and how to compute it:

```ts
import { defineFeatures, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

export const features = defineFeatures({
  inputs: { flags: input<MyFlags>() },
  features: {
    ticketChat: {
      reads: { flags: ['ticket-chat-rollout', 'ticket-chat-bot-variant'] },
      output: z.enum(['agent-chat', 'bot-chat', 'disabled']),
      resolve: ({ flags }) =>
        !flags['ticket-chat-rollout'] ? 'disabled'
        : flags['ticket-chat-bot-variant'] ? 'bot-chat'
        : 'agent-chat',
    },
    attachments: {
      reads: { flags: ['sd-1234-attachments-kill-switch'] },
      output: z.boolean(),
      // the kill switch flips meaning here, so app code never sees it
      resolve: ({ flags }) => !flags['sd-1234-attachments-kill-switch'],
    },
  },
});
```

**Step 2: add the provider** once, near the top of your React tree:

```tsx
import { createUnflagReact } from '@m4ttheweric/unflag/react';
import { features } from './features';

export const { UnflagProvider, useFeatures, useUnflag } = createUnflagReact(features);
```

```tsx
const inputs = useMemo(() => ({ flags }), [flags]);

<UnflagProvider inputs={inputs}>
  <App />
</UnflagProvider>
```

**Step 3: read features** anywhere below the provider:

```tsx
const features = useFeatures();

features.ticketChat === 'bot-chat'; // fully typed
features.attachments;               // boolean, meaning already resolved
```

> [!NOTE]
> You don't need React. The core is plain TypeScript: `features.resolve(inputs)` returns the same typed state, synchronously.

> [!TIP]
> Memoize the `inputs` object. A fresh object on every render forces a re-resolve. It's cheap, but it's wasted work.

## The dev panel

The panel is a live inspector for your feature state. It lists every feature, its current value, and why it has that value. You can override any feature to any valid value. Overrides survive page reloads.

```tsx
import { UnflagDevPanel } from '@m4ttheweric/unflag/react/devtools';

<UnflagProvider inputs={inputs} enableOverrides={isDev}>
  <App />
  <UnflagDevPanel useUnflag={useUnflag} />
</UnflagProvider>
```

It stays fast with hundreds of features. Rows are compact, there's a filter box, and detail renders only for the row you expand. Screenshots live in [docs/ui-evidence](https://github.com/m4ttheweric/unflag/blob/main/docs/ui-evidence/EVIDENCE.md).

> [!IMPORTANT]
> The panel ships on its own subpath so production bundles never include it. Load it behind a dev-only dynamic import, and only set `enableOverrides` in dev or staging.

## The lint rule

The rule makes the wall real: raw config can only be imported or read inside the files you allow.

```js
// eslint.config.js
import unflag from '@m4ttheweric/eslint-plugin-unflag';

export default [{
  plugins: { unflag },
  rules: {
    'unflag/no-raw-config-reads': ['error', {
      restricted: [{ importSource: '@my-app/feature-flags' }],
      allowIn: ['**/*.features.ts'],
    }],
  },
}];
```

`restricted` takes `{ importSource }` entries (ban an import) or `{ objectPattern }` entries (ban a dotted read like `window.__FLAGS__.foo`). `allowIn` is a glob list. It defaults to `['**/*.features.ts', '**/features/**']`.

> [!WARNING]
> `importSource` matches the import string exactly. It does not resolve modules. Restrict aliases or package names, not deep relative paths: `'../rawConfig'` will not catch `'../../rawConfig'`.

## Common options and methods

| Name | What it does |
| --- | --- |
| `defineFeatures` / `input` | declare inputs and features |
| `featureSet.resolve(inputs)` | inputs in, typed state plus provenance out |
| `explain(result, key)` | one readable line: value, reads, override status |
| `applyOverrides(result, overrides)` | patch state with schema-checked overrides |
| `featureSet.builder(baseline)` | test helper: baseline state, patch per test |
| `featureSet.graph()` | declared input-to-feature edges, for tooling |
| `createUnflagReact(featureSet)` | typed `UnflagProvider` / `useFeatures` / `useUnflag` |
| `UnflagDevPanel` | the inspector, from `@m4ttheweric/unflag/react/devtools` |

`UnflagProvider` props: `inputs` (required), `enableOverrides` (default `false`), `storageKey` (default `'unflag'`), `onViolation` (called when a resolver reads an input it did not declare).

> [!NOTE]
> Loading is your concern. unflag resolves whatever inputs you pass, right away. If your flag client is still loading, hold the provider back, or model "unknown" in your input types.
>
> Overrides patch feature **outputs**, not raw inputs. They always re-validate against the feature's schema, because localStorage can be edited by hand.
>
> Import zod as `zod/v4` in your feature files. That matches the schemas unflag checks against.

## Repo layout

| Path | What it is |
| --- | --- |
| `packages/unflag` | the library: core, `/react`, `/react/devtools` |
| `packages/eslint-plugin-unflag` | the lint rule |
| `examples/support-desk` | a small Vite app that uses everything above; add `?stress=300` to the URL to load-test the panel |
| `docs/ui-evidence` | screenshots and stress-test results |

## Contributing

This is a pnpm workspace. You need Node 20+ and pnpm.

```bash
pnpm install
pnpm build       # tsup, both packages
pnpm typecheck
pnpm test        # vitest
pnpm --filter support-desk dev   # run the example app
```

CI runs those same steps in that order (build must come first: the example resolves the packages from their built `dist/`). Development happens on macOS; CI runs on Linux. There are no other known portability concerns.

A full docs site is planned. Until then, the example app is the living reference.

## License

MIT
