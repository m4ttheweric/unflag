import { describe, expect, it, expectTypeOf } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, input } from '../index';

type Flags = { chat: boolean };
type Strategy = { mode: 'full' | 'lite' } | null;

const make = () =>
  defineFeatures({
    inputs: { flags: input<Flags>(), strategy: deferredInput<Strategy>() },
    features: {
      offered: {
        reads: { flags: ['chat'] },
        output: z.boolean(),
        resolve: ({ flags }) => flags.chat,
      },
      chatMode: {
        reads: { flags: ['chat'], strategy: ['mode'] },
        output: z.enum(['full', 'lite', 'off']),
        unready: 'off',
        resolve: ({ flags, strategy }) => (!flags.chat || !strategy ? 'off' : strategy.mode),
      },
    },
  });

describe('unready fallbacks (static)', () => {
  it('resolve() accepts omission of a deferred input and serves the unready value', () => {
    const result = make().resolve({ flags: { chat: true } });
    expect(result.state).toEqual({ offered: true, chatMode: 'off' });
    expect(result.provenance.chatMode).toMatchObject({
      unreadyFallback: true,
      awaitingInputs: ['strategy'],
    });
    expect(result.provenance.offered.unreadyFallback).toBeUndefined();
  });

  it('resolve() with the deferred input present runs the real resolver', () => {
    const result = make().resolve({ flags: { chat: true }, strategy: { mode: 'full' } });
    expect(result.state.chatMode).toBe('full');
    expect(result.provenance.chatMode.unreadyFallback).toBeUndefined();
  });

  it('a deferred input passed as undefined counts as absent', () => {
    const result = make().resolve({ flags: { chat: true }, strategy: undefined });
    expect(result.state.chatMode).toBe('off');
  });

  it('omitting a PLAIN input is a type error and a runtime error', () => {
    // @ts-expect-error flags is required
    expect(() => make().resolve({ strategy: null })).toThrowError(
      /missing required input\(s\) flags needed by feature "offered"/,
    );
  });

  it('define-time: deferred-reading feature without unready throws', () => {
    expect(() =>
      defineFeatures({
        inputs: { strategy: deferredInput<Strategy>() },
        features: {
          broken: { reads: { strategy: ['mode'] }, output: z.boolean(), resolve: () => true },
        },
      }),
    ).toThrowError(
      '[unflag] feature "broken" reads deferred input(s) strategy but declares no \'unready\' fallback',
    );
  });

  it('define-time: unready on a feature with no deferred reads throws (dead config)', () => {
    expect(() =>
      defineFeatures({
        inputs: { flags: input<Flags>() },
        features: {
          broken: {
            reads: { flags: ['chat'] },
            output: z.boolean(),
            unready: false,
            resolve: ({ flags }) => flags.chat,
          },
        },
      }),
    ).toThrowError('[unflag] feature "broken" declares \'unready\' but reads no deferred inputs');
  });

  it('define-time: static unready value failing the output schema throws', () => {
    expect(() =>
      defineFeatures({
        inputs: { strategy: deferredInput<Strategy>() },
        features: {
          broken: {
            reads: { strategy: ['mode'] },
            output: z.enum(['full', 'lite']),
            unready: 'nope' as 'full',
            resolve: () => 'full' as const,
          },
        },
      }),
    ).toThrowError(/feature "broken" 'unready' value does not match its output schema/);
  });

  it('types: unready static value must match the output type', () => {
    // 'bogus' is both a compile-time type mismatch (below) and, since defineFeatures
    // validates static unready values against the output schema at define time, a
    // runtime throw -- see the adjacent "static unready value failing the output
    // schema" test for that behavior in isolation.
    expect(() =>
      defineFeatures({
        inputs: { strategy: deferredInput<Strategy>() },
        features: {
          chatMode: {
            reads: { strategy: ['mode'] },
            output: z.enum(['full', 'lite']),
            // @ts-expect-error 'bogus' is not assignable to 'full' | 'lite'
            unready: 'bogus',
            resolve: () => 'full' as const,
          },
        },
      }),
    ).toThrowError(/'unready' value does not match its output schema/);
  });
});

describe('unready resolver form', () => {
  const makeFn = () =>
    defineFeatures({
      inputs: { flags: input<Flags>(), strategy: deferredInput<Strategy>() },
      features: {
        chatMode: {
          reads: { flags: ['chat'], strategy: ['mode'] },
          output: z.enum(['resolving', 'unavailable', 'full', 'lite']),
          unready: ({ flags }) => (flags.chat ? 'resolving' : 'unavailable'),
          resolve: ({ flags, strategy }) => (!flags.chat || !strategy ? 'unavailable' : strategy.mode),
        },
      },
    });

  it('computes the waiting state from non-deferred inputs', () => {
    expect(makeFn().resolve({ flags: { chat: true } }).state.chatMode).toBe('resolving');
    expect(makeFn().resolve({ flags: { chat: false } }).state.chatMode).toBe('unavailable');
  });

  it('unready resolver receives ONLY non-deferred inputs (deferred absent from its arg)', () => {
    const set = defineFeatures({
      inputs: { flags: input<Flags>(), strategy: deferredInput<Strategy>(), other: deferredInput<{ y: 1 }>() },
      features: {
        probe: {
          reads: { flags: ['chat'], strategy: ['mode'] },
          output: z.boolean(),
          unready: inputs => {
            expect(Object.keys(inputs)).toEqual(['flags']);
            return false;
          },
          resolve: () => true,
        },
      },
    });
    // 'other' IS provided, but deferred inputs are excluded from the unready arg regardless
    set.resolve({ flags: { chat: true }, other: { y: 1 } });
  });

  it('flags undeclared reads inside the unready resolver via onViolation', () => {
    const violations: unknown[] = [];
    const set = defineFeatures({
      inputs: { flags: input<{ chat: boolean; secret: string }>(), strategy: deferredInput<Strategy>() },
      features: {
        probe: {
          reads: { flags: ['chat'], strategy: ['mode'] },
          output: z.boolean(),
          unready: ({ flags }) => flags.secret === 'x',
          resolve: () => true,
        },
      },
      onViolation: v => violations.push(v),
    });
    set.resolve({ flags: { chat: true, secret: 'x' } });
    expect(violations).toContainEqual({ feature: 'probe', input: 'flags', key: 'secret' });
  });

  it('wraps an unready resolver throw with feature context', () => {
    const set = defineFeatures({
      inputs: { strategy: deferredInput<Strategy>() },
      features: {
        probe: {
          reads: { strategy: ['mode'] },
          output: z.boolean(),
          unready: () => { throw new Error('boom'); },
          resolve: () => true,
        },
      },
    });
    expect(() => set.resolve({})).toThrowError('[unflag] feature "probe" unready resolver threw: boom');
  });

  it('validates the unready resolver output against the schema in dev', () => {
    const set = defineFeatures({
      inputs: { strategy: deferredInput<Strategy>() },
      features: {
        probe: {
          reads: { strategy: ['mode'] },
          output: z.enum(['a', 'b']),
          unready: () => 'nope' as 'a',
          resolve: () => 'a' as const,
        },
      },
    });
    expect(() => set.resolve({})).toThrowError(
      /feature "probe" unready resolver returned a value that does not match its output schema/,
    );
  });
});
