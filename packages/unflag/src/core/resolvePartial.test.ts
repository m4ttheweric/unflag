import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, input } from '../index';

type Flags = { chat: boolean };
type Gates = { shell: boolean };
type Strategy = { mode: 'full' | 'lite' } | null;

const make = () =>
  defineFeatures({
    inputs: { flags: input<Flags>(), gates: input<Gates>(), strategy: deferredInput<Strategy>() },
    features: {
      offered: {
        reads: { flags: ['chat'], gates: ['shell'] },
        output: z.boolean(),
        resolve: ({ flags, gates }) => flags.chat && !gates.shell,
      },
      chatMode: {
        reads: { strategy: ['mode'] },
        output: z.enum(['full', 'lite', 'off']),
        unready: 'off',
        resolve: ({ strategy }) => strategy?.mode ?? 'off',
      },
      constant: {
        reads: {},
        output: z.literal('always'),
        resolve: () => 'always' as const,
      },
    },
  });

describe('resolvePartial', () => {
  it('resolves exactly the features whose reads are satisfied; others are absent', () => {
    const { state, provenance } = make().resolvePartial({ flags: { chat: true }, gates: { shell: false } });
    expect(state).toEqual({ offered: true, constant: 'always' });
    expect(Object.keys(provenance)).toEqual(['offered', 'constant']);
  });

  it('excluded features are absent from the TYPE', () => {
    const { state } = make().resolvePartial({ flags: { chat: true }, gates: { shell: false } });
    expectTypeOf(state).toEqualTypeOf<{ offered: boolean; constant: 'always' }>();
    // @ts-expect-error chatMode reads 'strategy', which was not provided
    state.chatMode;
  });

  it('no-reads features always resolve', () => {
    const { state } = make().resolvePartial({});
    expect(state).toEqual({ constant: 'always' });
    expectTypeOf(state).toEqualTypeOf<{ constant: 'always' }>();
  });

  it('a provided deferred input satisfies reads like any other input', () => {
    const { state } = make().resolvePartial({ strategy: { mode: 'full' } });
    expect(state).toEqual({ chatMode: 'full', constant: 'always' });
  });

  it('skipped features emit no violations and never run (undefined-valued key counts as absent)', () => {
    const violations: unknown[] = [];
    const set = defineFeatures({
      inputs: { flags: input<Flags>() },
      features: {
        probe: {
          reads: { flags: ['chat'] },
          output: z.boolean(),
          resolve: ({ flags }) => {
            throw new Error('must not run');
          },
        },
      },
      onViolation: v => violations.push(v),
    });
    const { state } = set.resolvePartial({ flags: undefined });
    expect(state).toEqual({});
    expect(violations).toEqual([]);
  });

  it('does NOT serve unready fallbacks (absence, not fallback)', () => {
    const { state } = make().resolvePartial({ flags: { chat: true }, gates: { shell: false } });
    expect('chatMode' in state).toBe(false);
  });
});
