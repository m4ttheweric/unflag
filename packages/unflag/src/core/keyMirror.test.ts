import { describe, expect, expectTypeOf, it } from 'vitest';
import { keyMirror } from '../index';

type Flags = { 'emma-adjuster-chat': boolean; chat: boolean };

describe('keyMirror', () => {
  it('returns each key name as its value, with the literal type', () => {
    const ff = keyMirror<Flags>();
    expect(ff.chat).toBe('chat');
    expect(ff['emma-adjuster-chat']).toBe('emma-adjuster-chat');
    expectTypeOf(ff.chat).toEqualTypeOf<'chat'>();
    // @ts-expect-error unknown key
    ff.nope;
  });

  it('is access-only: enumeration sees nothing (documented constraint)', () => {
    expect(Object.keys(keyMirror<Flags>())).toEqual([]);
    expect({ ...keyMirror<Flags>() }).toEqual({});
  });
});
