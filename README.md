<p align="center"><img src="./unflag_logo_small.png" width="160" alt="unflag logo" /></p>

# unflag

<p align="center">Config in, typed product state out.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@m4ttheweric/unflag"><img src="https://img.shields.io/npm/v/%40m4ttheweric%2Funflag?label=%40m4ttheweric%2Funflag" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@m4ttheweric/eslint-plugin-unflag"><img src="https://img.shields.io/npm/v/%40m4ttheweric%2Feslint-plugin-unflag?label=eslint-plugin-unflag" alt="npm" /></a>
</p>

---

## Table of Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Deferred inputs and unready fallbacks](#deferred-inputs-and-unready-fallbacks)
- [Contributing inputs from deep in the tree](#contributing-inputs-from-deep-in-the-tree)
- [Explicit status: useFeatureStatus](#explicit-status-usefeaturestatus)
- [Partial resolution, for tests and scripts](#partial-resolution-for-tests-and-scripts)
- [Composing feature sets](#composing-feature-sets)
- [The dev panel](#the-dev-panel)
- [The lint rule](#the-lint-rule)
- [Common options and methods](#common-options-and-methods)
- [Repo layout](#repo-layout)
- [Contributing](#contributing)
- [License](#license)

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

> [!NOTE]
> **What's new in 0.2.0**: runtime behavior is back-compatible with 0.1.3. If you
> structurally implement `FeatureSet` or `UnflagContextValue` yourself (rather than
> using `defineFeatures` and `createUnflagReact`), you'll see new required members:
> `inputs`, `resolvePartial`, `statuses`, and `parents`.

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

> [!TIP]
> `keyMirror<MyFlags>()` gives you a typed mirror of your input type's keys: `const ff = keyMirror<MyFlags>()`. Then `reads: { flags: [ff['ticket-chat-rollout']] }` survives a rename. It's access-only sugar with no runtime object behind it, so don't spread or iterate it. Raw strings keep working everywhere it's not used.

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

## Deferred inputs and unready fallbacks

Some inputs don't exist yet when you first resolve. A gated GraphQL query, or a config
service that answers after the flag client does. Declare those with `deferredInput`
instead of `input`. Deferred keys become optional in `resolve()`. Every other input
stays required:

```ts
import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

// settled-empty is null, never undefined -- see the modeling rule below
type Strategy = { mode: 'full' | 'lite'; banner: string | null } | null;

export const features = defineFeatures({
  inputs: {
    flags: input<MyFlags>(),
    strategy: deferredInput<Strategy>(), // may be absent when resolve() runs
  },
  features: {
    // reads only the always-ready `flags` input, so this is itself always ready --
    // a contributor can gate its query on it without waiting on `strategy`.
    claimChatOffered: {
      reads: { flags: ['claimChatEnabled'] },
      output: z.boolean(),
      resolve: ({ flags }) => flags.claimChatEnabled,
    },
    claimChat: {
      reads: { flags: ['claimChatEnabled'], strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'resolving', 'unavailable']),
      // the waiting state depends on the flag, so this needs the resolver form (below)
      unready: ({ flags }) => (flags.claimChatEnabled ? 'resolving' : 'unavailable'),
      resolve: ({ flags, strategy }) =>
        !flags.claimChatEnabled || !strategy ? 'unavailable' : strategy.mode,
    },
  },
});
```

A feature that reads a `deferredInput` must declare `unready`. unflag throws at define
time if it's missing. It also throws if a feature that reads no deferred input declares
`unready` anyway (dead config). `unready` takes two forms:

- **Static**, when there's exactly one true waiting state:

  ```ts
  banner: {
    reads: { strategy: ['banner'] },
    output: z.string().nullable(),
    unready: null,
    resolve: ({ strategy }) => strategy?.banner ?? null,
  },
  ```

- **Resolver**, over the feature's non-deferred reads only, when the correct waiting
  state depends on another input. `claimChat` above is `'unavailable'` when the flag
  is off outright, and `'resolving'` only once the flag is on and `strategy` hasn't
  shown up yet. The resolver can't see the deferred input that triggered it: its
  type excludes every deferred read, even ones that happen to be present. Its
  output is schema-checked in dev, exactly like an ordinary resolver.

With `strategy` declared deferred, omitting it from `resolve()` is legal:

```ts
features.resolve({ flags }); // strategy omitted
```

Features that don't read `strategy` resolve normally. `claimChat` serves its `unready`
value, and `explain()` says why:

```text
claimChat = "resolving" (unready: awaiting strategy)
```

Call sites never see this distinction. `useFeatures()` and `resolve().state` return a
plain `'full' | 'lite' | 'resolving' | 'unavailable'`, never `T | undefined`. That's the
same shape whether or not `strategy` has arrived. Use `useFeatureStatus` (below) for the
rare call site that needs to know.

> [!IMPORTANT]
> Don't model absence with `undefined` in an input type. `resolvePartial` and
> `useProvideInput` (both below) treat `undefined` as "not provided". An input type
> that legitimately contains `undefined` (say, `Partial<Flags> | undefined` for "still
> loading") collides with that. `resolvePartial` will silently skip features that read
> it, even while the type still says it's there. A contributor loses the ability to say
> "settled, nothing here". Wrap the real state in the value instead: use `{ isLoading:
> boolean, values: Flags }` for in-flight, and `null` for settled-and-empty (as
> `Strategy` does above). `deferredInput<T>()` type-rejects a `T` that admits
> `undefined`, because this is exactly where consumers reach for `| undefined` first.

## Contributing inputs from deep in the tree

A `deferredInput` doesn't have to come from the provider's `inputs` prop.
`useProvideInput` lets a component anywhere below the provider supply it from wherever
the data actually lives. Typically that's a small **contributor component** that owns
the gated query:

```tsx
function StrategyContributor() {
  const { claimChatOffered } = useFeatures(); // always-ready inputs only
  const { data } = useQuery(StrategyConfigDoc, { skip: !claimChatOffered });

  useProvideInput(
    'strategy',
    // undefined while in flight (ignored); a settled-but-empty result is null, per the
    // modeling rule above. Gate the CONTRIBUTION, not just the query -- if the flag
    // later flips false, an ungated contribution would keep serving a stale cached value.
    !claimChatOffered || data === undefined ? undefined : (data.config ?? null),
  );
  return null;
}
```

Mount it anywhere under the provider; it renders nothing. This is the recommended way
to gate a query in React. See [Partial resolution](#partial-resolution-for-tests-and-scripts)
below for why a host-side `resolvePartial` call is not.

- Passing `undefined` means "nothing right now". No contribution registers, and any
  earlier contribution from this hook instance is withdrawn, so the feature reverts to
  its `unready` fallback. Unmounting does the same.
- Two components contributing the same key at once is a dev-mode warning. Last write wins.
- Dev-panel overrides still beat an unready fallback, even for a feature whose query
  hasn't landed.

> [!WARNING]
> The contributed value **must be referentially stable**: memoized, or owned by the
> query client. A fresh object every render re-resolves every render. If the
> contributor also reads feature state, it loops. React does not crash on this kind of
> loop; it just spins. unflag's dev-only churn guard catches it instead. After a few
> identity changes in a row it warns once, naming the key and the fix. Then it
> **drops** further identity-churning contributions for that key until they quiet down.
> While the guard is engaged, the feature serves its declared `unready` fallback,
> stale but alive, instead of hanging. Once the churn quiets down, the last contributed
> value lands automatically (as long as the contributor is still mounted), so a
> legitimate rapid burst is throttled for a moment, never stranded. This is a safety
> net for a bug, not a substitute for memoizing. A same-identity contribution is always
> accepted and never trips it.

## Explicit status: useFeatureStatus

Most call sites never need to know a feature is unready. `useFeatures()` already gives
them the fallback value. The few that render differently while waiting can ask directly:

```tsx
const { status, value } = useFeatureStatus('claimChat'); // { status: 'ready' | 'unready', value: T }

if (status === 'unready') return <ChatSkeleton />;
```

`value` is populated in both arms, so `useFeatureStatus` works as the value read too,
not just the status check. For a wider view, `useUnflag().statuses` returns every
feature's status in one map: `Record<featureKey, 'ready' | 'unready'>`.

## Partial resolution, for tests and scripts

`resolvePartial` is a second, separate method on a feature set. It is not a looser
`resolve`, which keeps its total signature as a safety property. Any input, deferred or
plain, may be omitted:

```ts
const result = features.resolvePartial({ flags: testFlags });
```

The rule is **absence, not fallbacks**. A feature is included only if every input its
`reads` names was provided. A skipped feature is absent from `result.state`. It is
absent from `result.provenance` too, and its resolver never ran. That fits two honest
use cases. **Tests**: build only the fixture your feature actually reads. **Non-React
scripts**: a backend job that has `flags` but no `caseGates`, say, conceptually lacks
that input.

```ts
// only features whose reads are fully covered by { flags } come back
const { attachments } = features.resolvePartial({ flags }).state;
```

> [!NOTE]
> `resolvePartial` is not the recommended way to gate a query in React. Reaching for
> it there means a host-side double resolve. Use the
> [contributor pattern](#contributing-inputs-from-deep-in-the-tree) above instead. It
> supersedes that shape for gated queries.

## Composing feature sets

A feature set can consume another set's resolved state as an input:

```ts
const appFeatures = defineFeatures({ /* ... */ });

const caseFeatures = defineFeatures({
  inputs: {
    app: fromFeatureSet(appFeatures), // typed as appFeatures' resolved state
    caseGates: input<CaseGates>(),
  },
  features: {
    chatOffered: {
      reads: { app: ['chatEnabled'], caseGates: ['isShell'] },
      output: z.boolean(),
      resolve: ({ app, caseGates }) => app.chatEnabled && !caseGates.isShell,
    },
  },
});
```

To the resolve machinery, `app` is an ordinary input. Violation tracking works the same
way. Called imperatively, you pass the parent's resolved state explicitly:

```ts
caseFeatures.resolve({ app: appFeatures.resolve(appInputs).state, caseGates });
```

In React, nest the providers. The child auto-injects the parent's state from context.
Its `inputs` prop doesn't accept the `app` key. It can't: unflag injects that key itself:

```tsx
const App = createUnflagReact(appFeatures);
const Case = createUnflagReact(caseFeatures);

<App.UnflagProvider inputs={{ flags }}>
  <Case.UnflagProvider inputs={{ caseGates }}>
    {/* Case.useFeatures() sees chatOffered; the parent re-resolving flows down automatically */}
  </Case.UnflagProvider>
</App.UnflagProvider>;
```

Mount `UnflagDevPanel` on the child, and the panel renders the parent's section above
the child's: one panel, two hops, not two unrelated worlds. Deeper nesting composes the
same way.

> [!IMPORTANT]
> The parent's state is always complete. An unready parent feature already holds its
> declared fallback, so the child needs no unready mechanism of its own at the seam.
> If a parent feature must signal "still working on it", it carries that as a plain
> value in its output (say, an enum member like `'resolving'`), not as a separate
> readiness channel. A child feature that treats a parent's in-flight value as if it
> were `false`, like `chatOffered` above, which folds `'resolving'` into "not offered",
> is a real modeling choice. Make it on purpose, in the resolver, not by accident.

<!-- -->

> [!NOTE]
> A missing ancestor provider throws a clear error naming both sets. If the provider IS
> mounted and you still see it, check for two copies of `unflag` in your dependency
> tree. A duplicated package copy registers the parent in one copy's registry while
> the child looks in the other's.

<!-- -->

> [!TIP]
> If both a nested provider and its parent set `enableOverrides`, give them distinct
> `storageKey`s. They otherwise share the default `'unflag'` key and collide in
> localStorage.

## The dev panel

The panel is a live inspector for your feature state. It lists every feature, its current value, and why it has that value. You can override any feature to any valid value. Overrides survive page reloads.

```tsx
import { UnflagDevPanel } from '@m4ttheweric/unflag/react/devtools';

<UnflagProvider inputs={inputs} enableOverrides={isDev}>
  <App />
  <UnflagDevPanel useUnflag={useUnflag} />
</UnflagProvider>
```

It stays fast with hundreds of features. Rows are compact, there's a filter box, and detail renders only for the row you expand. Screenshots live in [docs/ui-evidence](./docs/ui-evidence/EVIDENCE.md).

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
| `deferredInput` | an input that may be absent at resolve time; the feature needs an `unready` fallback |
| `keyMirror<T>()` | typed, rename-safe key mirror for `reads` (access-only) |
| `fromFeatureSet(set)` | compose one feature set's resolved state as another's input |
| `featureSet.resolve(inputs)` | inputs in, typed state plus provenance out; deferred inputs may be omitted |
| `featureSet.resolvePartial(inputs)` | absence-only resolve: any input may be omitted, unsatisfied features are skipped |
| `explain(result, key)` | one readable line: value, reads, override or unready status |
| `applyOverrides(result, overrides)` | patch state with schema-checked overrides |
| `featureSet.builder(baseline)` | test helper: baseline state, patch per test |
| `featureSet.graph()` | declared input-to-feature edges, for tooling |
| `createUnflagReact(featureSet)` | typed `UnflagProvider` / `useFeatures` / `useUnflag` |
| `useProvideInput(key, value)` | contribute a deferred input from deep in the tree |
| `useFeatureStatus(key)` | `{ status, value }` for the rare call site that needs to know it's unready |
| `useUnflag().statuses` | every feature's `'ready' \| 'unready'` status, in one map |
| `UnflagDevPanel` | the inspector, from `@m4ttheweric/unflag/react/devtools` |

`UnflagProvider` props: `inputs` (required), `enableOverrides` (default `false`), `storageKey` (default `'unflag'`), `onViolation` (called when a resolver reads an input it did not declare).

> [!NOTE]
> Loading is your concern. unflag resolves whatever inputs you pass, right away. If your flag client is still loading, hold the provider back. For a single input that arrives late on its own schedule, use `deferredInput` and an `unready` fallback instead. See [Deferred inputs and unready fallbacks](#deferred-inputs-and-unready-fallbacks).
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
