/**
 * `JSON.stringify` throws for BigInt values and for cyclic objects, which would
 * otherwise blank an entire devtools panel or `explain()` call over a single
 * unserializable feature value. This never throws: it falls back to `String(value)`
 * (e.g. `10n` -> `"10"`), and if even that throws (or the value is undefined, which
 * `JSON.stringify` silently drops), falls back to a fixed placeholder.
 */
export function safeStringify(value: unknown, space?: string | number): string {
  try {
    const text = JSON.stringify(value, null, space);
    if (text !== undefined) return text;
  } catch {
    // fall through to String()
  }
  try {
    return String(value);
  } catch {
    return '[unserializable]';
  }
}
