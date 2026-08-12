import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
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

    const update = useCallback(
      (next: Record<string, unknown>) => {
        setOverrides(next);
        writeOverrides(storageKey, next);
      },
      [storageKey],
    );

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
        update({ ...overrides, [key]: value });
      },
      [enableOverrides, overrides, update],
    );

    const clearOverride = useCallback(
      (key: string) => {
        const { [key]: _, ...rest } = overrides;
        update(rest);
      },
      [overrides, update],
    );

    const clearAll = useCallback(() => update({}), [update]);

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
