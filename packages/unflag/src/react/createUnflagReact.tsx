import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { z } from 'zod/v4';
import { applyOverrides } from '../core/overrides';
import { explain as coreExplain } from '../core/explain';
import {
  isProd,
  type FeatureSet, type InputsShape, type InputValues, type ResolveResult, type StateOf,
  type ViolationHandler,
} from '../core/types';
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
};

export function createUnflagReact<I extends InputsShape, F>(featureSet: FeatureSet<I, F>) {
  type State = StateOf<F>;
  const Context = createContext<UnflagContextValue<State> | undefined>(undefined);

  function UnflagProvider({
    inputs,
    enableOverrides = false,
    storageKey = 'unflag',
    onViolation,
    children,
  }: {
    inputs: InputValues<I>;
    enableOverrides?: boolean;
    storageKey?: string;
    onViolation?: ViolationHandler;
    children: React.ReactNode;
  }) {
    const [overrides, setOverrides] = useState<Record<string, unknown>>(() =>
      enableOverrides ? readOverrides(storageKey) : {},
    );

    const base = useMemo(
      () => featureSet.resolve(inputs, onViolation ? { onViolation } : undefined),
      [inputs, onViolation],
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
      }),
      [result, overrides, setOverride, clearOverride, clearAll, enableOverrides],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
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

  return { UnflagProvider, useFeatures, useUnflag };
}
