import { describe, expect, it } from 'vitest';
import { safeStringify } from './safeStringify';

describe('safeStringify', () => {
  it('stringifies ordinary values like JSON.stringify', () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    expect(safeStringify('x')).toBe('"x"');
  });

  it('supports the space argument like JSON.stringify', () => {
    expect(safeStringify({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
  });

  it('falls back to String() for BigInt, which JSON.stringify throws on', () => {
    expect(safeStringify(10n)).toBe('10');
  });

  it('never throws for a cyclic object', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => safeStringify(obj)).not.toThrow();
    expect(safeStringify(obj)).toBe('[object Object]');
  });
});
