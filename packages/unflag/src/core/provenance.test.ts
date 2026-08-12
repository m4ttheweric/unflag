import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input, type Violation } from '../index';

type Flags = { a: boolean; b: boolean };

const make = (onViolation?: (v: Violation) => void) =>
  defineFeatures({
    inputs: { flags: input<Flags>() },
    onViolation,
    features: {
      declared: {
        reads: { flags: ['a'] },
        output: z.boolean(),
        resolve: ({ flags }) => flags.a,
      },
      sneaky: {
        reads: { flags: ['a'] },
        output: z.boolean(),
        resolve: ({ flags }) => flags.a && flags.b, // reads undeclared 'b'
      },
    },
  });

describe('provenance', () => {
  it('records actual reads with values', () => {
    const result = make().resolve({ flags: { a: true, b: false } });
    expect(result.provenance.declared.actualReads).toEqual([
      { input: 'flags', key: 'a', value: true },
    ]);
  });

  it('fires onViolation for undeclared reads', () => {
    const seen: Violation[] = [];
    make(v => seen.push(v)).resolve({ flags: { a: true, b: false } });
    expect(seen).toEqual([{ feature: 'sneaky', input: 'flags', key: 'b' }]);
  });

  it('per-resolve handler wins over set-level handler', () => {
    const setLevel = vi.fn();
    const callLevel = vi.fn();
    make(setLevel).resolve({ flags: { a: true, b: false } }, { onViolation: callLevel });
    expect(setLevel).not.toHaveBeenCalled();
    expect(callLevel).toHaveBeenCalledOnce();
  });

  it('default handler warns in non-prod', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    make().resolve({ flags: { a: true, b: false } });
    expect(warn).toHaveBeenCalledWith(
      '[unflag] feature "sneaky" read undeclared input flags.b',
    );
    warn.mockRestore();
  });

  it('does not record reads made by one feature under another', () => {
    const result = make().resolve({ flags: { a: true, b: false } });
    expect(result.provenance.declared.actualReads).toHaveLength(1);
  });

  it('does not record inherited/prototype property reads as violations', () => {
    const seen: Violation[] = [];
    const set = defineFeatures({
      inputs: { flags: input<Flags>() },
      onViolation: v => seen.push(v),
      features: {
        coercive: {
          reads: { flags: ['a'] },
          output: z.string(),
          resolve: ({ flags }) => {
            String(flags);
            flags.hasOwnProperty('a');
            return flags.a ? 'yes' : 'no';
          },
        },
      },
    });
    const result = set.resolve({ flags: { a: true, b: false } });
    expect(result.provenance.coercive.actualReads).toEqual([
      { input: 'flags', key: 'a', value: true },
    ]);
    expect(seen).toEqual([]);
  });

  it('does not abort resolve when a violation handler throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const set = defineFeatures({
      inputs: { flags: input<Flags>() },
      onViolation: () => {
        throw new Error('boom');
      },
      features: {
        declared: {
          reads: { flags: ['a'] },
          output: z.boolean(),
          resolve: ({ flags }) => flags.a,
        },
        sneaky: {
          reads: { flags: ['a'] },
          output: z.boolean(),
          resolve: ({ flags }) => flags.a && flags.b,
        },
      },
    });
    const result = set.resolve({ flags: { a: true, b: false } });
    expect(result.state).toEqual({ declared: true, sneaky: false });
    expect(error).toHaveBeenCalledWith('[unflag] onViolation handler threw: boom');
    error.mockRestore();
  });
});
