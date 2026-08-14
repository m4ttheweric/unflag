import { safeStringify } from './safeStringify';
import type { ResolveResult, Read } from './types';

const fmtReads = (reads: Read[]): string =>
  reads.length === 0
    ? 'no inputs read'
    : reads.map(r => `${r.input}['${r.key}'] = ${safeStringify(r.value)}`).join(', ');

export function explain<S>(result: ResolveResult<S>, key: Extract<keyof S, string>): string {
  const prov = (result.provenance as Record<
    string,
    {
      value: unknown;
      overridden: boolean;
      underlying?: unknown;
      actualReads: Read[];
      unreadyFallback?: boolean;
      awaitingInputs?: readonly string[];
    }
  >)[key];
  if (!prov) throw new Error(`[unflag] explain: unknown feature "${key}"`);
  const value = safeStringify(prov.value);
  if (prov.overridden) {
    return `${key} = ${value} (OVERRIDDEN; would be ${safeStringify(prov.underlying)}: ${fmtReads(prov.actualReads)})`;
  }
  if (prov.unreadyFallback) {
    return `${key} = ${value} (unready: awaiting ${(prov.awaitingInputs ?? []).join(', ')})`;
  }
  return `${key} = ${value} (${fmtReads(prov.actualReads)})`;
}
