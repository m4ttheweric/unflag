import type { z } from 'zod/v4';
import { resolveFeatures, type AnyConfig } from './resolve';
import type {
  FeatureDef, FeatureSet, InputMarker, InputsShape, InputValues,
  ResolveOptions, ViolationHandler,
} from './types';

export const input = <T,>(): InputMarker<T> => ({ __unflag: 'input' });

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
    schemas,
    resolve: (inputs: InputValues<I>, opts?: ResolveOptions) =>
      resolveFeatures(config as unknown as AnyConfig, inputs, opts) as ReturnType<
        FeatureSet<I, F>['resolve']
      >,
    graph: () => {
      throw new Error('[unflag] graph() not implemented yet');
    },
    builder: () => {
      throw new Error('[unflag] builder() not implemented yet');
    },
  };
  return set;
}
