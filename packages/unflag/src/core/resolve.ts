import type { z } from 'zod/v4';
import { recordingProxy } from './proxy';
import {
  SCHEMAS, isProd,
  type FeatureProvenance, type InputsShape, type Read, type ResolveOptions, type ResolveResult,
} from './types';

type AnyFeatureDef = { reads: Record<string, readonly string[] | undefined>; output: z.ZodType; unready?: unknown; resolve: (inputs: unknown) => unknown };
export type AnyConfig = { inputs: InputsShape; features: Record<string, AnyFeatureDef>; onViolation?: (v: { feature: string; input: string; key: string }) => void };

type ViolationHandlerFn = (v: { feature: string; input: string; key: string }) => void;

export type ResolveMode = 'total' | 'partial';

function buildProxied(
  inputs: Record<string, unknown>,
  skip: (name: string) => boolean,
  featureKey: string,
  declared: Record<string, readonly string[]>,
  reads: Read[],
  handler: ViolationHandlerFn,
): Record<string, unknown> {
  const proxied: Record<string, unknown> = {};
  for (const [inputName, inputValue] of Object.entries(inputs)) {
    if (inputValue === undefined || skip(inputName)) continue;
    proxied[inputName] =
      inputValue !== null && typeof inputValue === 'object'
        ? recordingProxy(inputName, inputValue as object, read => {
            reads.push(read);
            if (!(declared[inputName] ?? []).includes(read.key)) {
              try {
                handler({ feature: featureKey, input: inputName, key: read.key });
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
  return proxied;
}

export function resolveFeatures(
  config: AnyConfig,
  inputs: Record<string, unknown>,
  opts?: ResolveOptions,
  mode: ResolveMode = 'total',
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

  const providedKeys = new Set(
    Object.entries(inputs).filter(([, v]) => v !== undefined).map(([k]) => k),
  );
  const deferredNames = new Set(
    Object.entries(config.inputs)
      .filter(([, m]) => (m as { __unflag: string }).__unflag === 'deferred')
      .map(([k]) => k),
  );

  for (const [key, def] of Object.entries(config.features)) {
    const declared = normalizeReads(def.reads);
    const required = Object.keys(declared);
    const missing = required.filter(name => !providedKeys.has(name));
    const reads: Read[] = [];

    if (missing.length > 0) {
      if (mode === 'partial') continue; // skip: no state, no provenance, no violations
      const missingPlain = missing.filter(name => !deferredNames.has(name));
      if (missingPlain.length > 0) {
        throw new Error(
          `[unflag] resolve() is missing required input(s) ${missingPlain.join(', ')} needed by feature "${key}"`,
        );
      }
      let value: unknown;
      if (typeof def.unready === 'function') {
        const plainProxied = buildProxied(inputs, name => deferredNames.has(name), key, declared, reads, handler);
        try {
          value = (def.unready as (i: Record<string, unknown>) => unknown)(plainProxied);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`[unflag] feature "${key}" unready resolver threw: ${msg}`, { cause: e });
        }
        if (!isProd()) {
          const parsed = def.output.safeParse(value);
          if (!parsed.success) {
            throw new Error(
              `[unflag] feature "${key}" unready resolver returned a value that does not match its output schema: ${parsed.error.message}`,
            );
          }
        }
      } else {
        value = def.unready;
      }
      state[key] = value;
      provenance[key] = {
        value,
        declaredReads: declared,
        actualReads: reads,
        overridden: false,
        unreadyFallback: true,
        awaitingInputs: missing,
      };
      continue;
    }

    const proxied = buildProxied(inputs, () => false, key, declared, reads, handler);
    let value: unknown;
    try {
      value = def.resolve(proxied);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`[unflag] feature "${key}" resolver threw: ${msg}`, { cause: e });
    }

    if (!isProd()) {
      const parsed = def.output.safeParse(value);
      if (!parsed.success) {
        throw new Error(
          `[unflag] feature "${key}" resolved a value that does not match its output schema: ${parsed.error.message}`,
        );
      }
    }

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
