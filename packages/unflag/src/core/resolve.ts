import type { z } from 'zod/v4';
import { recordingProxy } from './proxy';
import {
  SCHEMAS, isProd,
  type FeatureProvenance, type InputsShape, type Read, type ResolveOptions, type ResolveResult,
} from './types';

type AnyFeatureDef = { reads: Record<string, readonly string[] | undefined>; output: z.ZodType; resolve: (inputs: unknown) => unknown };
export type AnyConfig = { inputs: InputsShape; features: Record<string, AnyFeatureDef>; onViolation?: (v: { feature: string; input: string; key: string }) => void };

export function resolveFeatures(
  config: AnyConfig,
  inputs: Record<string, unknown>,
  opts?: ResolveOptions,
): ResolveResult<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  const provenance: Record<string, FeatureProvenance> = {};

  const handler =
    opts?.onViolation ??
    config.onViolation ??
    ((v: { feature: string; input: string; key: string }) => {
      if (!isProd()) {
        console.warn(`[unflag] feature "${v.feature}" read undeclared input ${v.input}.${v.key}`);
      }
    });

  for (const [key, def] of Object.entries(config.features)) {
    const declared = normalizeReads(def.reads);
    const reads: Read[] = [];
    const proxied: Record<string, unknown> = {};
    for (const [inputName, inputValue] of Object.entries(inputs)) {
      proxied[inputName] =
        inputValue !== null && typeof inputValue === 'object'
          ? recordingProxy(inputName, inputValue as object, read => {
              reads.push(read);
              if (!(declared[inputName] ?? []).includes(read.key)) {
                try {
                  handler({ feature: key, input: inputName, key: read.key });
                } catch (err) {
                  if (!isProd()) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`[unflag] onViolation handler threw: ${message}`);
                  }
                }
              }
            })
          : inputValue;
    }
    const value = def.resolve(proxied);
    state[key] = value;
    provenance[key] = { value, declaredReads: declared, actualReads: reads, overridden: false };
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
