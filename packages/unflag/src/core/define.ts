import type { z } from 'zod/v4';
import { normalizeReads, resolveFeatures, type AnyConfig } from './resolve';
import type {
  DeferredInputMarker, FeatureDef, FeatureSet, InputMarker, InputsShape, InputValues,
  ResolveInputs, ResolveOptions, StateOf, ViolationHandler,
} from './types';

export const input = <T,>(): InputMarker<T> => ({ __unflag: 'input' });

export type DeferredInputTypeError = {
  readonly __unflagError: "deferredInput's type must not admit undefined; wrap loading or emptiness in the value (e.g. { isLoading, values } or null). See the unflag docs on input modeling.";
};

export const deferredInput = <T,>(): [undefined] extends [T] ? DeferredInputTypeError
  : DeferredInputMarker<T> => ({ __unflag: 'deferred' }) as never;

export function defineFeatures<
  I extends InputsShape,
  const F extends Record<string, FeatureDef<I, z.ZodType>>,
>(config: {
  inputs: I;
  features: F & { [K in keyof F]: FeatureDef<I, F[K]['output']> };
  onViolation?: ViolationHandler;
}): FeatureSet<I, F> {
  const schemas = Object.fromEntries(
    Object.entries(config.features).map(([k, def]) => [k, (def as { output: z.ZodType }).output]),
  ) as { [K in keyof F]: z.ZodType };

  const deferredNames = new Set(
    Object.entries(config.inputs)
      .filter(([, m]) => (m as { __unflag: string }).__unflag === 'deferred')
      .map(([k]) => k),
  );
  for (const [key, def] of Object.entries(config.features)) {
    const d = def as { reads: Record<string, readonly string[] | undefined>; output: z.ZodType; unready?: unknown };
    const required = Object.keys(normalizeReads(d.reads));
    const readsDeferred = required.filter(name => deferredNames.has(name));
    const hasUnready = d.unready !== undefined;
    if (readsDeferred.length > 0 && !hasUnready) {
      throw new Error(
        `[unflag] feature "${key}" reads deferred input(s) ${readsDeferred.join(', ')} but declares no 'unready' fallback`,
      );
    }
    if (readsDeferred.length === 0 && hasUnready) {
      throw new Error(
        `[unflag] feature "${key}" declares 'unready' but reads no deferred inputs (dead config)`,
      );
    }
    if (hasUnready && typeof d.unready !== 'function') {
      const parsed = d.output.safeParse(d.unready);
      if (!parsed.success) {
        throw new Error(
          `[unflag] feature "${key}" 'unready' value does not match its output schema: ${parsed.error.message}`,
        );
      }
    }
  }

  const set: FeatureSet<I, F> = {
    inputs: config.inputs,
    schemas,
    resolve: (inputs: ResolveInputs<I>, opts?: ResolveOptions) =>
      resolveFeatures(config as unknown as AnyConfig, inputs, opts) as ReturnType<
        FeatureSet<I, F>['resolve']
      >,
    graph: () =>
      Object.fromEntries(
        Object.entries(config.features).map(([k, def]) => [
          k,
          normalizeReads((def as { reads: Record<string, readonly string[] | undefined> }).reads),
        ]),
      ) as ReturnType<FeatureSet<I, F>['graph']>,

    builder: (baseline: InputValues<I>) => {
      let cached: StateOf<F> | undefined;
      return (overrides?: Partial<StateOf<F>>) => {
        cached ??= (resolveFeatures(config as unknown as AnyConfig, baseline) as { state: StateOf<F> }).state;
        return { ...cached, ...overrides };
      };
    },
  };
  return set;
}
