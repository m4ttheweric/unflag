# unflag

Config in, typed product state out. Two published packages plus a demo app in a pnpm workspace.

## Identity

- npm scope is **@m4ttheweric** (`@m4ttheweric/unflag`, `@m4ttheweric/eslint-plugin-unflag`). Never `@mattstack`; this project is not part of the mattstack program. Bare `unflag` is squatted on npm.
- Linear: team `unflag` (child of m4ttheweric). File tickets there, not MAT.
- Solo repo: commit directly to `main`, no feature branches unless a PR is specifically wanted for evidence/review.
- MIT licensed. Nothing Assured-specific may ever enter this repo (the CVI/Assured consumer work lives in assured-dev under CV tickets).

## Layout

- `packages/unflag` — the library. Exports: `.` (core, React-free), `./react`, `./react/devtools`.
- `packages/eslint-plugin-unflag` — one rule, `unflag/no-raw-config-reads` (flat config; plugin KEY stays `unflag`).
- `examples/support-desk` — the living reference and dogfood app. `?stress=N` (capped at 2000) synthesizes N features to load-test the dev panel.
- `docs/ui-evidence` — screenshot suite, stress measurements, and `capture.mjs` (local playwright-core harness; env `UNFLAG_PW_CORE` + `UNFLAG_CHROMIUM`).
- `.local-dev/` (gitignored) — specs and plans. `.superpowers/sdd/` (gitignored) — the v1 build ledger: every review, fix round, ruling, and deferred minor.

## API invariants (do not regress)

- Features are **plain object literals** inside `defineFeatures`; there is no standalone `feature()` export (a wrapper cannot type resolver inputs).
- Every feature has a required zod `output` schema. Import zod as `zod/v4` everywhere; peer is `zod >= 3.25`.
- The root export must stay React-free (verified via `node -e "require('./dist/index.cjs')"`).
- Overrides are output-level and ALWAYS schema-validated, prod included (localStorage is untrusted input).
- Resolution is pure and synchronous; loading/readiness is the caller's concern. Never add loading states to the library.
- Never let a render path call raw `JSON.stringify` on feature values; use `safeStringify` (BigInt/cyclic values crash otherwise).
- The dev panel stays on its own subpath, zero style/runtime dependencies, detail-on-demand (collapsed rows mount no controls).

## Working conventions

- Strict TDD: failing test first, then implement. Run gates as separate commands, never tail-piped: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm --filter support-desk lint`.
- CI order matters: **build before typecheck** (the example resolves workspace packages from built `dist/`; clean checkouts fail otherwise).
- READMEs go through the `github-readme` skill: audit script strict-pass, Flesch-Kincaid grade 9 or below, GitHub alert blocks for callouts. Package README is a synced copy of the root one with absolute GitHub URLs for in-repo links.
- Keep the repo README's logo reference to `unflag_logo_small.png` (the 320px one); the 1254px original stays out of tarballs.

## Release ceremony (manual; no changesets yet)

1. Bump `version` in the changed package(s).
2. Gates green, commit, push main.
3. `git tag -a vX.Y.Z -m "..."` + push tag; `gh release create` for notable releases.
4. Publish runs as Matt (per-publish 2FA): `cd packages/<pkg> && pnpm publish --otp=<code>` via `!` in-session, or a normal terminal. `prepublishOnly` runs typecheck+test+build automatically.
5. Verify with `npm view @m4ttheweric/<pkg> version` (allow a minute of registry lag).

## Known deferred items

- eslint `importSource` matching is exact-string; restrict aliases/bare specifiers, not deep relative paths (documented in README).
- Panel palette resolves `prefers-color-scheme` once at module load.
- localStorage persistence raw-stringifies overrides (try/catch-swallowed; a BigInt override just doesn't persist).
- No panel virtualization; revisit only if real feature counts reach thousands.
