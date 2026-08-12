import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input, type InferState } from '../index';

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
});
