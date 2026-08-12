import type { z } from 'zod/v4';
import { SCHEMAS, type ResolveResult } from './types';

export function applyOverrides<S>(
  result: ResolveResult<S>,
  overrides: Record<string, unknown>,
): ResolveResult<S> {
  const schemas = (result as Record<symbol, unknown>)[SCHEMAS] as
    | Record<string, z.ZodType>
    | undefined;
  if (!schemas) {
    throw new Error('[unflag] applyOverrides requires a ResolveResult produced by resolve()');
  }

  const state = { ...result.state } as Record<string, unknown>;
  const provenance = Object.fromEntries(
    Object.entries(result.provenance as Record<string, object>).map(([k, p]) => [k, { ...p }]),
  ) as ResolveResult<S>['provenance'];
  const discardedOverrides: Record<string, { attempted: unknown; reason: string }> = {
    ...result.discardedOverrides,
  };

  for (const [key, attempted] of Object.entries(overrides)) {
    const schema = schemas[key];
    if (!schema) {
      discardedOverrides[key] = { attempted, reason: 'unknown feature key' };
      continue;
    }
    const parsed = schema.safeParse(attempted);
    const prov = (provenance as Record<string, { value: unknown; overridden: boolean; underlying?: unknown; staleOverrideDiscarded?: { attempted: unknown; reason: string } }>)[key];
    if (!parsed.success) {
      if (prov) prov.staleOverrideDiscarded = { attempted, reason: parsed.error.message };
      continue;
    }
    if (prov) {
      prov.underlying = prov.overridden ? prov.underlying : prov.value;
      prov.overridden = true;
      prov.value = parsed.data;
    }
    state[key] = parsed.data;
  }

  const next: ResolveResult<S> = {
    state: state as S,
    provenance,
    ...(Object.keys(discardedOverrides).length ? { discardedOverrides } : {}),
  };
  Object.defineProperty(next, SCHEMAS, { value: schemas, enumerable: false });
  return next;
}
