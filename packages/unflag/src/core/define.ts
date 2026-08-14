import type { z } from 'zod/v4';
import { normalizeReads, resolveFeatures, type AnyConfig } from './resolve';
import type {
  DeferredInputMarker, FeatureDef, FeatureSet, InputMarker, InputsShape, InputValues,
  ResolveOptions, StateOf, ViolationHandler,
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

  const set: FeatureSet<I, F> = {
    inputs: config.inputs,
    schemas,
    resolve: (inputs: InputValues<I>, opts?: ResolveOptions) =>
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
