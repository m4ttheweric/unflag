# unflag

<p align="center"><img src="./unflag_logo_small.png" width="180" alt="unflag logo" /></p>

Published as `@m4ttheweric/unflag` and `@m4ttheweric/eslint-plugin-unflag`.

```
pnpm add @m4ttheweric/unflag zod
```

Config in, typed product state out: you feed `unflag` your raw flags and
config documents, and it hands back a typed, validated bundle of *features*
that your app code consumes. Think of it as a wall between "the messy things
ops and vendors hand us" and "the clean thing our components read": nothing
on the app side of that wall ever touches a raw flag key again.

## Why

**Enforcement.** The included eslint rule (`@m4ttheweric/eslint-plugin-unflag`) makes the
wall load-bearing instead of aspirational: it flags any import of a raw
config module, or any read of a raw config object, from outside the
feature-resolution files you designate. Reviewers stop having to eyeball
diffs for a stray `flags['some-flag']` creeping into a component; the linter
catches it.

**Introspection.** Every resolved feature carries its provenance: which raw
inputs it actually read (not just declared), and, once overridden, what its
non-overridden value would have been. `explain()` turns that into a
human-readable line, and `UnflagDevPanel` turns it into a live, in-browser
inspector so anyone can answer "why is this feature on?" without reading
code.

**Vocabulary.** Features are named, typed, schema-validated values --
`ticketChat: 'agent-chat' | 'bot-chat' | 'disabled'`, not
`flags['ticket-chat-rollout'] && !flags['ticket-chat-bot-variant']`. The
resolved state is the vocabulary your product actually speaks, and
`zod` catches a resolver that drifts from its declared output at resolve
time rather than at some render three files away.

**Test ergonomics.** `builder()` resolves a baseline state once and hands
back a function that patches overrides onto it, so a test that only cares
about one feature doesn't have to construct a full raw-config fixture to get
there.

## Quick start

Define your inputs and features once, close to the raw config they read
(from `examples/support-desk/src/features/supportDesk.features.ts`):

```ts
import { defineFeatures, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';
import type { DemoFlags, PlanConfig } from '../rawConfig';

export const supportDeskFeatures = defineFeatures({
  inputs: { flags: input<DemoFlags>(), plan: input<PlanConfig>() },
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
      // kill switch polarity absorbed here, never visible to app code
      resolve: ({ flags }) => !flags['sd-1234-attachments-kill-switch'],
    },
    ticketLimits: {
      reads: { plan: ['tier', 'maxOpenTickets'] },
      output: z.object({ maxOpen: z.number(), upgradeNudge: z.boolean() }),
      resolve: ({ plan }) => ({
        maxOpen: plan.maxOpenTickets,
        upgradeNudge: plan.tier === 'free',
      }),
    },
  },
});
```

There is no standalone `feature()` export -- each entry under `features` is
a plain object literal (`{ reads, output, resolve }`) inside the single
`defineFeatures` call; the generic constraint on `defineFeatures` is what
gives every entry precise per-feature typing.

Wire it into React with `createUnflagReact`
(`examples/support-desk/src/features/unflag.react.ts`):

```ts
import { createUnflagReact } from '@m4ttheweric/unflag/react';
import { supportDeskFeatures } from './supportDesk.features';

export const { UnflagProvider, useFeatures, useUnflag } = createUnflagReact(supportDeskFeatures);
```

And consume it from a component (`examples/support-desk/src/App.tsx`):

```tsx
function Desk() {
  const features = useFeatures();
  return (
    <main style={{ font: '15px system-ui', padding: 24, maxWidth: 640 }}>
      <h1>Support Desk</h1>
      <p>
        Chat: <strong>{features.ticketChat}</strong>
      </p>
      <p>Attachments: <strong>{features.attachments ? 'available' : 'unavailable'}</strong></p>
      <p>
        Open-ticket limit: <strong>{features.ticketLimits.maxOpen}</strong>
        {features.ticketLimits.upgradeNudge ? ' (upgrade for more)' : ''}
      </p>
    </main>
  );
}

function NormalApp() {
  const [flags, setFlags] = useState<DemoFlags>(defaultFlags);
  // Memoized so `inputs` is referentially stable across renders that don't
  // change `flags` -- see Design notes below for why that matters.
  const inputs = useMemo(() => ({ flags, plan: defaultPlan }), [flags]);
  return (
    <UnflagProvider inputs={inputs} enableOverrides storageKey="unflag.support-desk">
      <Desk />
      <UnflagDevPanel useUnflag={useUnflag} />
    </UnflagProvider>
  );
}
```

`Desk` never imports `rawConfig`; it only ever sees `features.ticketChat`,
`features.attachments`, `features.ticketLimits`, already resolved and typed.

The example app also ships a stress mode (`?stress=N` in the URL, see
`examples/support-desk/src/features/stress.features.ts`), which synthesizes
`N` features on the fly as a load-test fixture for the dev panel.

## Overrides and the dev panel

`UnflagProvider` accepts `enableOverrides` (default `false`) and a
`storageKey` (default `'unflag'`) that together turn on a localStorage-backed
override layer: `setOverride`/`clearOverride`/`clearAll` (exposed via
`useUnflag()`) let anyone force a feature to a specific value, and the
override persists across reloads under that key. Because the stored value
comes from an untrusted source (raw localStorage, editable by hand), every
override is re-validated against the feature's own `zod` schema before it is
applied; anything that fails validation is discarded and recorded in
`discardedOverrides` / `staleOverrideDiscarded` rather than silently used.

`UnflagDevPanel` is the in-browser surface for that layer: a small floating
trigger that expands into a scannable list of compact rows, one per feature,
each showing the feature name, a truncated one-line preview of its current
value, and an "overridden" badge. A filter input narrows the list by name,
and a counts line reports how many features exist, how many are overridden,
and how many the filter is showing. Clicking a row expands it (one at a
time) to reveal the detail: the value it would otherwise be, an editor for
setting a new override (validated against the same schema), a reset control,
and a "why?" disclosure backed by `explain()`. Clear-all sits in the footer.
Detail is mounted only for the expanded row, so a set with hundreds of
features costs hundreds of cheap rows rather than hundreds of live editors
and stays responsive. It takes the
`useUnflag` hook produced by `createUnflagReact` as a prop
(`<UnflagDevPanel useUnflag={useUnflag} />`) rather than reading context
directly, so it stays decoupled from any single feature set.

`UnflagDevPanel` lives at the `@m4ttheweric/unflag/react/devtools` subpath specifically so
it can be excluded from production bundles: import it behind `React.lazy` (or
an equivalent dynamic import) and gate that import on a dev-only condition,
rather than importing it unconditionally alongside `@m4ttheweric/unflag/react`.

## Lint enforcement

`@m4ttheweric/eslint-plugin-unflag` ships one rule, `unflag/no-raw-config-reads`, that
restricts raw config imports/reads to the modules you allow (typically the
`*.features.ts` files and nothing else). From
`examples/support-desk/eslint.config.js`:

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

`restricted` entries are either `{ importSource }` (bans an import
specifier) or `{ objectPattern }` (bans a dotted member-access chain, e.g.
`window.__FLAGS__.foo`); `allowIn` is a picomatch glob allowlist, defaulting
to `['**/*.features.ts', '**/features/**']` when omitted.

## API reference

| Export | Signature |
| --- | --- |
| `defineFeatures` | `(config: { inputs: I; features: F; onViolation?: ViolationHandler }) => FeatureSet<I, F>` |
| `input` | `<T,>() => InputMarker<T>` |
| `FeatureSet#resolve` | `(inputs: InputValues<I>, opts?: ResolveOptions) => ResolveResult<StateOf<F>>` |
| `applyOverrides` | `<S,>(result: ResolveResult<S>, overrides: Record<string, unknown>) => ResolveResult<S>` |
| `explain` | `<S,>(result: ResolveResult<S>, key: Extract<keyof S, string>) => string` |
| `FeatureSet#graph` | `() => Record<Extract<keyof F, string>, Record<string, readonly string[]>>` |
| `FeatureSet#builder` | `(baseline: InputValues<I>) => (overrides?: Partial<StateOf<F>>) => StateOf<F>` |
| `createUnflagReact` | `<I extends InputsShape, F,>(featureSet: FeatureSet<I, F>) => { UnflagProvider, useFeatures, useUnflag }` |
| `UnflagDevPanel` | `(props: { useUnflag: () => UnflagContextValue<Record<string, unknown>>; position?: PanelPosition }) => JSX.Element` |

## Design notes

- **Readiness is the caller's concern.** `unflag` resolves whatever inputs
  you hand it, synchronously; it has no opinion on whether your flag client
  or config fetch has finished loading. If "not ready yet" needs to be a
  representable state, model it in your input types (e.g. a `| undefined`)
  and resolve it explicitly, rather than expecting the library to gate on
  readiness for you.
- **Overrides are output-level, not input-level, and always validated.**
  `setOverride`/`applyOverrides` patch the *resolved* feature value, not the
  raw inputs that produced it -- there is no way to override a raw flag and
  have a resolver re-run against it. Every override round-trips through the
  feature's own `zod` schema before being applied, because the storage layer
  it's read from (localStorage) is untrusted and editable by hand; anything
  that fails validation is discarded rather than applied.
- **`zod` is imported from the `zod/v4` subpath**, with a peer dependency of
  `>=3.25` (the first version to ship that subpath). Import `z` the same way
  in your own feature files (`import { z } from 'zod/v4'`) to match the
  schemas `unflag` validates against internally.
- **Known limitation: `importSource` matching in the eslint rule is an exact
  string match**, not a resolved-module match. It matches whatever specifier
  appears in the `import` statement, so a relative import only matches at
  the exact relative depth you list (`'../rawConfig'` won't catch
  `'../../rawConfig'` from a file one directory deeper). Prefer restricting
  bare specifiers or module aliases -- the primary real-world case -- over
  relative paths, since aliases resolve to one string regardless of the
  importing file's location.
- **Known limitation: `UnflagProvider`'s `inputs` prop should be memoized by
  the parent.** A fresh object literal passed as `inputs` on every render
  will force a re-resolve of the whole feature set every render (the
  `useMemo` inside `UnflagProvider` is keyed on referential identity of
  `inputs`). Resolving is cheap, so this doesn't break correctness, but it's
  wasted work; hold `inputs` in state or memoize it rather than constructing
  it inline in JSX.
