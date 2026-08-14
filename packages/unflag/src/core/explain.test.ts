import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { applyOverrides, defineFeatures, deferredInput, explain, input } from '../index';

const make = () =>
  defineFeatures({
    inputs: { flags: input<{ 'emma-adjuster-chat': boolean }>() },
    features: {
      chatExperience: {
        reads: { flags: ['emma-adjuster-chat'] },
        output: z.enum(['emma-chat', 'disabled']),
        resolve: ({ flags }) => (flags['emma-adjuster-chat'] ? 'emma-chat' : 'disabled'),
      },
      constant: {
        reads: {},
        output: z.boolean(),
        resolve: () => true,
      },
    },
  });

describe('explain', () => {
  it('formats a plain resolution with its reads', () => {
    const result = make().resolve({ flags: { 'emma-adjuster-chat': false } });
    expect(explain(result, 'chatExperience')).toBe(
      `chatExperience = "disabled" (flags['emma-adjuster-chat'] = false)`,
    );
  });

  it('formats an overridden feature with the underlying value', () => {
    const result = applyOverrides(make().resolve({ flags: { 'emma-adjuster-chat': false } }), {
      chatExperience: 'emma-chat',
    });
    expect(explain(result, 'chatExperience')).toBe(
      `chatExperience = "emma-chat" (OVERRIDDEN; would be "disabled": flags['emma-adjuster-chat'] = false)`,
    );
  });

  it('handles features that read nothing', () => {
    const result = make().resolve({ flags: { 'emma-adjuster-chat': true } });
    expect(explain(result, 'constant')).toBe('constant = true (no inputs read)');
  });

  it('throws on an unknown key', () => {
    const result = make().resolve({ flags: { 'emma-adjuster-chat': true } });
    expect(() => explain(result, 'nope' as never)).toThrowError(
      '[unflag] explain: unknown feature "nope"',
    );
  });

  it('surfaces unready status with the awaited inputs', () => {
    const withUnready = defineFeatures({
      inputs: { flags: input<{ chat: boolean }>(), strategy: deferredInput<{ mode: 'full' | 'lite' } | null>() },
      features: {
        chatMode: {
          reads: { flags: ['chat'], strategy: ['mode'] },
          output: z.enum(['full', 'lite', 'off']),
          unready: 'off',
          resolve: ({ flags, strategy }) => (!flags.chat || !strategy ? 'off' : strategy.mode),
        },
      },
    });
    const result = withUnready.resolve({ flags: { chat: true } });
    expect(explain(result, 'chatMode')).toBe('chatMode = "off" (unready: awaiting strategy)');
  });

  it('does not throw for a feature resolving to a BigInt, which JSON.stringify rejects', () => {
    const withBigint = defineFeatures({
      inputs: { flags: input<{ 'emma-adjuster-chat': boolean }>() },
      features: {
        big: {
          reads: {},
          output: z.bigint(),
          resolve: () => 10n,
        },
      },
    });
    const result = withBigint.resolve({ flags: { 'emma-adjuster-chat': true } });
    expect(() => explain(result, 'big')).not.toThrow();
    expect(explain(result, 'big')).toContain('10');
  });
});
