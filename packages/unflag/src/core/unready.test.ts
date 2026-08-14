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
