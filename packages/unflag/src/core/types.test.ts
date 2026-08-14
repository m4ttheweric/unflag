import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, input, type DeferredKeys, type InferState, type PlainKeys, type ResolveInputs } from '../index';

describe('type inference', () => {
  it('infers state from output schemas and types resolver inputs', () => {
    const set = defineFeatures({
      inputs: { flags: input<{ a: boolean }>() },
      features: {
        mode: {
          reads: { flags: ['a'] },
          output: z.enum(['on', 'off']),
          resolve: ({ flags }) => {
            expectTypeOf(flags).toEqualTypeOf<{ a: boolean }>();
            return flags.a ? 'on' : 'off';
          },
        },
      },
    });
    type State = InferState<typeof set>;
    expectTypeOf<State>().toEqualTypeOf<{ mode: 'on' | 'off' }>();
    const result = set.resolve({ flags: { a: true } });
    expectTypeOf(result.state.mode).toEqualTypeOf<'on' | 'off'>();
  });

  it('rejects a resolver return that violates its own output schema', () => {
    defineFeatures({
      inputs: { flags: input<{ a: boolean }>() },
      features: {
        mode: {
          reads: { flags: ['a'] },
          output: z.enum(['on', 'off']),
          // @ts-expect-error resolver must return z.output<typeof output> ('on' | 'off'), not an arbitrary string
          resolve: ({ flags }) => (flags.a ? 'on' : 'anything-else'),
        },
      },
    });
  });
});

describe('deferred input markers', () => {
  it('classifies plain vs deferred keys and makes deferred keys optional in ResolveInputs', () => {
    const inputs = {
      flags: input<{ a: boolean }>(),
      strategy: deferredInput<{ mode: 'x' | 'y' } | null>(),
    };
    type I = typeof inputs;
    expectTypeOf<DeferredKeys<I>>().toEqualTypeOf<'strategy'>();
    expectTypeOf<PlainKeys<I>>().toEqualTypeOf<'flags'>();
    expectTypeOf<ResolveInputs<I>>().toEqualTypeOf<
      { flags: { a: boolean } } & { strategy?: { mode: 'x' | 'y' } | null }
    >();
  });

  it('deferredInput rejects a T that admits undefined', () => {
    const bad = deferredInput<{ mode: string } | undefined>();
    expectTypeOf(bad).toHaveProperty('__unflagError');
    defineFeatures({
      // @ts-expect-error DeferredInputTypeError is not a valid input marker
      inputs: { strategy: bad },
      features: {},
    });
  });

  it('deferredInput returns a runtime marker with kind "deferred"', () => {
    expect(deferredInput<{ x: 1 }>()).toEqual({ __unflag: 'deferred' });
  });
});
