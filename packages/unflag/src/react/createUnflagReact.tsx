import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { z } from 'zod/v4';
import { applyOverrides } from '../core/overrides';
import { explain as coreExplain } from '../core/explain';
import {
  isProd,
  type DeferredKeys, type FeatureSet, type FromSetKeys, type InputsShape, type InputValues,
  type ResolveInputs, type ResolveResult, type StateOf, type ViolationHandler,
} from '../core/types';
import { getSetContext, registerSetContext } from './registry';
import { readOverrides, writeOverrides } from './storage';

export type UnflagContextValue<S> = {
  result: ResolveResult<S>;
  overrides: Record<string, unknown>;
  setOverride: (key: string, value: unknown) => void;
  clearOverride: (key: string) => void;
  clearAll: () => void;
  overridesEnabled: boolean;
  explain: (key: Extract<keyof S, string>) => string;
  schemas: Record<string, z.ZodType>;
  statuses: Record<string, 'ready' | 'unready'>;
  parents: ReadonlyArray<{ label: string; ctx: UnflagContextValue<Record<string, unknown>> }>;
};

/** `UnflagProvider`'s `inputs` prop type: fromFeatureSet keys are auto-injected from the
 * ancestor provider for that set, so the host must not (and cannot) pass them. */
export type ProviderInputs<I extends InputsShape> = Omit<ResolveInputs<I>, FromSetKeys<I>>;

const NullParentContext = createContext<unknown>(undefined);

type ContributionEntry = { owner: string; value: unknown };

/** Contribution plumbing for useProvideInput, kept off the state context so a
 * contribution never forces a re-render of components that only consume this context. */
type ContributionApi = {
  contribute: (key: string, owner: string, value: unknown) => void;
  withdraw: (key: string, owner: string) => void;
};

export function createUnflagReact<I extends InputsShape, F>(featureSet: FeatureSet<I, F>) {
  type State = StateOf<F>;
  const Context = createContext<UnflagContextValue<State> | undefined>(undefined);
  registerSetContext(featureSet as object, Context as React.Context<unknown>);
  const ContributionContext = createContext<ContributionApi | undefined>(undefined);

  const fromSetEntries = Object.entries(
    featureSet.inputs as Record<string, { __unflag?: string; __set?: object }>,
  )
    .filter(([, marker]) => marker.__unflag === 'fromSet')
    .map(([name, marker]) => [name, marker.__set as object] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  function UnflagProvider({
    inputs,
    enableOverrides = false,
    storageKey = 'unflag',
    onViolation,
    children,
  }: {
    inputs: ProviderInputs<I>;
    enableOverrides?: boolean;
    storageKey?: string;
    onViolation?: ViolationHandler;
    children: React.ReactNode;
  }) {
    const [overrides, setOverrides] = useState<Record<string, unknown>>(() =>
      enableOverrides ? readOverrides(storageKey) : {},
    );

    const parentValues: Array<{ label: string; ctx: UnflagContextValue<Record<string, unknown>> }> = [];
    for (const [name, parentSet] of fromSetEntries) {
      const parentContext = getSetContext(parentSet);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- fromSetEntries is constant per set, so hook order is stable
      const parentValue = useContext((parentContext ?? NullParentContext) as React.Context<unknown>) as
        | UnflagContextValue<Record<string, unknown>>
        | undefined;
      if (!parentValue) {
        throw new Error(
          `[unflag] UnflagProvider: input "${name}" comes fromFeatureSet(...), but no ancestor UnflagProvider for that set was found. Mount the parent set's provider above this one. If it IS mounted, your dependency tree may contain two copies of unflag (the parent registered in one copy's registry, this provider searched the other); dedupe the package.`,
        );
      }
      parentValues.push({ label: name, ctx: parentValue });
    }
    // Memoized so the chain's identity changes ONLY when a parent republishes its context
    // value. parentValues is a fresh array each render; without this memo the child's
    // context value memo (which depends on `parents`) would republish every render and
    // re-render every consumer under it. Deps length is constant per set (fromSetEntries
    // is fixed), so the variable-length deps array is legal. Covers the no-parent case
    // too: empty deps, computed once, stable [].
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-keyed on each parent's context value
    const parents = useMemo(
      () =>
        parentValues.flatMap(({ label, ctx }) => [
          ...ctx.parents.map(p => ({ label: `${label}.${p.label}`, ctx: p.ctx })),
          { label, ctx },
        ]),
      parentValues.map(({ ctx }) => ctx),
    );

    // Kept current every render (not read during render itself) so `contribute` -- a
    // useCallback([])-stable function -- can see the host's latest `inputs` prop without
    // being redefined per render.
    const hostInputsRef = useRef(inputs);
    hostInputsRef.current = inputs;
    const shadowWarnedRef = useRef(new Set<string>());

    const [contributions, setContributions] = useState<Record<string, ContributionEntry>>({});
    const contributorsRef = useRef(new Map<string, Set<string>>());
    // Dev-only identity-churn detection (spec 2.2): survives withdraw (which is why it does
    // not read `contributions`), resets on a quiet window or a same-identity contribution.
    const churnRef = useRef(
      new Map<string, { last: unknown; count: number; reset: ReturnType<typeof setTimeout> | undefined }>(),
    );

    const contribute = useCallback((key: string, owner: string, value: unknown) => {
      const owners = contributorsRef.current.get(key) ?? new Set<string>();
      owners.add(owner);
      contributorsRef.current.set(key, owners);
      if (owners.size > 1 && !isProd()) {
        console.warn(`[unflag] input "${key}" has ${owners.size} live contributors; last write wins`);
      }
      if (!isProd() && !shadowWarnedRef.current.has(key)) {
        const hostValue = (hostInputsRef.current as Record<string, unknown>)[key];
        if (hostValue !== undefined) {
          shadowWarnedRef.current.add(key);
          console.warn(
            `[unflag] input "${key}" was provided by the host and is now shadowed by a useProvideInput contribution; the contribution wins`,
          );
        }
      }
      let dropped = false;
      if (!isProd()) {
        const churn = churnRef.current.get(key);
        if (churn === undefined || Object.is(churn.last, value)) {
          if (churn?.reset) clearTimeout(churn.reset);
          churnRef.current.set(key, { last: value, count: 0, reset: undefined });
        } else {
          clearTimeout(churn.reset);
          const count = churn.count + 1;
          churnRef.current.set(key, {
            last: value,
            count,
            reset: setTimeout(() => churnRef.current.delete(key), 100),
          });
          if (count === 4) {
            console.warn(
              `[unflag] the value contributed for "${key}" changes identity every render; memoize it (or contribute the query-owned object). Churning contributions for this key are now dropped until they quiet down.`,
            );
          }
          if (count >= 4) {
            // Breaker: keep tracking churn (above) so the quiet-window reset still works,
            // but stop feeding fresh-identity values into resolution until it quiets down.
            dropped = true;
          }
        }
      }
      if (dropped) return;
      setContributions(prev =>
        prev[key] && Object.is(prev[key].value, value) ? prev : { ...prev, [key]: { owner, value } },
      );
    }, []);

    const withdraw = useCallback((key: string, owner: string) => {
      contributorsRef.current.get(key)?.delete(owner);
      setContributions(prev => {
        if (prev[key]?.owner !== owner) return prev;
        const { [key]: _gone, ...rest } = prev;
        return rest;
      });
    }, []);

    // Clear the dev-only churn-detection timers on provider unmount so fast-unmounting
    // jsdom tests never see a stray timeout.
    useEffect(
      () => () => {
        for (const { reset } of churnRef.current.values()) clearTimeout(reset);
      },
      [],
    );

    const parentStates = Object.fromEntries(parentValues.map(({ label, ctx }) => [label, ctx.result.state]));
    const effectiveInputs = useMemo(() => {
      const contributed = Object.fromEntries(
        Object.entries(contributions).map(([k, entry]) => [k, entry.value]),
      );
      return { ...(inputs as Record<string, unknown>), ...parentStates, ...contributed };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- parentStates is identity-keyed by each parent's result.state
    }, [inputs, contributions, ...parentValues.map(({ ctx }) => ctx.result.state)]);

    const base = useMemo(
      () =>
        featureSet.resolve(
          effectiveInputs as ResolveInputs<I>,
          onViolation ? { onViolation } : undefined,
        ),
      [effectiveInputs, onViolation],
    );

    const result = useMemo(
      () => (Object.keys(overrides).length > 0 ? applyOverrides(base, overrides) : base),
      [base, overrides],
    );

    // Persistence is intentionally decoupled from the mutators below: each mutator only
    // computes the next `overrides` value via a functional `setOverrides` updater, so
    // multiple mutations inside one React batch (one `act`/event handler) compose instead
    // of clobbering each other on a stale closure. This effect is the single place that
    // writes to storage, keyed off the settled `overrides` value.
    const skipFirstPersist = useRef(true);
    useEffect(() => {
      if (!enableOverrides) return;
      if (skipFirstPersist.current) {
        // Skip the mount-time run: `overrides` was just read from storage (or is empty
        // because nothing was stored), so writing it back is a no-op at best and, for the
        // empty case, an avoidable `removeItem` call against a key that was never set.
        skipFirstPersist.current = false;
        return;
      }
      writeOverrides(storageKey, overrides);
    }, [enableOverrides, storageKey, overrides]);

    const setOverride = useCallback(
      (key: string, value: unknown) => {
        if (!enableOverrides) {
          if (!isProd()) {
            throw new Error(
              '[unflag] setOverride called but overrides are not enabled on this UnflagProvider',
            );
          }
          return;
        }
        setOverrides(prev => ({ ...prev, [key]: value }));
      },
      [enableOverrides],
    );

    const clearOverride = useCallback((key: string) => {
      setOverrides(prev => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    }, []);

    const clearAll = useCallback(() => setOverrides({}), []);

    const statuses = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(result.provenance).map(([k, p]) => {
            const prov = p as { overridden?: boolean; unreadyFallback?: boolean };
            // An override always reports 'ready': status describes what the consumer is
            // served, and an override is a settled, intentional value regardless of
            // whether the underlying resolution was unready. Dev-panel badges are
            // unaffected by this (they still render straight from provenance).
            return [k, !prov.overridden && prov.unreadyFallback ? 'unready' : 'ready'];
          }),
        ) as Record<string, 'ready' | 'unready'>,
      [result],
    );

    const value = useMemo(
      (): UnflagContextValue<State> => ({
        result,
        overrides,
        setOverride,
        clearOverride,
        clearAll,
        overridesEnabled: enableOverrides,
        explain: key => coreExplain<State>(result, key),
        schemas: featureSet.schemas as Record<string, z.ZodType>,
        statuses,
        parents,
      }),
      [result, overrides, setOverride, clearOverride, clearAll, enableOverrides, statuses, parents],
    );

    // Identity-stable (contribute/withdraw are useCallback([])): a contribution never
    // changes this object's identity, so it never forces useProvideInput consumers to
    // re-render. That's what keeps a churning contribution from re-triggering itself.
    const contributionApi = useMemo(() => ({ contribute, withdraw }), [contribute, withdraw]);

    return (
      <Context.Provider value={value}>
        <ContributionContext.Provider value={contributionApi}>{children}</ContributionContext.Provider>
      </Context.Provider>
    );
  }

  function useUnflag(): UnflagContextValue<State> {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('[unflag] useUnflag must be used within its UnflagProvider');
    return ctx;
  }

  function useFeatures(): State {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('[unflag] useFeatures must be used within its UnflagProvider');
    return ctx.result.state;
  }

  function useFeatureStatus<K extends Extract<keyof State, string>>(
    key: K,
  ): { status: 'ready' | 'unready'; value: State[K] } {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('[unflag] useFeatureStatus must be used within its UnflagProvider');
    return { status: ctx.statuses[key] ?? 'ready', value: ctx.result.state[key] };
  }

  /**
   * Contribute a deferred input from wherever the data naturally lives. Pass undefined
   * to contribute nothing (withdrawing this hook instance's prior contribution, if any).
   * The contributed value MUST be referentially stable (memoized or query-owned); a
   * fresh object per render re-resolves every render and, if this component also reads
   * feature state, loops indefinitely (React does not crash effect loops); unflag warns
   * once and then drops churning contributions for that key until a quiet window. The
   * churn guard is development-only; in production builds a churning contributor that
   * also reads feature state loops unbounded, which is why the guard exists to catch it
   * before ship. Two live contributors for one key is misuse (dev-warned): last write
   * wins, and after the winning contributor unmounts the loser does NOT take over (its
   * effect deps never changed); the input reverts to unready.
   */
  function useProvideInput<K extends Extract<DeferredKeys<I>, string>>(
    key: K,
    value: InputValues<I>[K] | undefined,
  ): void {
    const ctx = useContext(ContributionContext);
    if (!ctx) throw new Error('[unflag] useProvideInput must be used within its UnflagProvider');
    const owner = React.useId();
    const { contribute, withdraw } = ctx;
    useEffect(() => {
      if (value === undefined) return; // prior effect's cleanup already withdrew
      contribute(key, owner, value);
      return () => withdraw(key, owner);
    }, [contribute, withdraw, key, owner, value]);
  }

  return { UnflagProvider, useFeatures, useUnflag, useProvideInput, useFeatureStatus };
}
