import type { z } from 'zod/v4';
import {
  SCHEMAS,
  type FeatureProvenance, type InputsShape, type ResolveOptions, type ResolveResult,
} from './types';

type AnyFeatureDef = { reads: Record<string, readonly string[] | undefined>; output: z.ZodType; resolve: (inputs: unknown) => unknown };
export type AnyConfig = { inputs: InputsShape; features: Record<string, AnyFeatureDef>; onViolation?: (v: { feature: string; input: string; key: string }) => void };

export function resolveFeatures(
  config: AnyConfig,
  inputs: Record<string, unknown>,
  _opts?: ResolveOptions,
): ResolveResult<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  const provenance: Record<string, FeatureProvenance> = {};

  for (const [key, def] of Object.entries(config.features)) {
    const value = def.resolve(inputs);
    state[key] = value;
    provenance[key] = {
      value,
      declaredReads: normalizeReads(def.reads),
      actualReads: [],
      overridden: false,
    };
  }

  const result: ResolveResult<Record<string, unknown>> = { state, provenance };
  Object.defineProperty(result, SCHEMAS, {
    value: Object.fromEntries(Object.entries(config.features).map(([k, d]) => [k, d.output])),
    enumerable: false,
  });
  return result;
}

export function normalizeReads(
  reads: Record<string, readonly string[] | undefined>,
): Record<string, readonly string[]> {
  return Object.fromEntries(Object.entries(reads).filter(([, v]) => v !== undefined)) as Record<string, readonly string[]>;
}
