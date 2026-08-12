import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { applyOverrides, defineFeatures, explain, input } from '../index';

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
});
