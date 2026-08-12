import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input } from '../index';

const resolveSpy = vi.fn(({ flags }: { flags: { a: boolean } }) => (flags.a ? 'on' : 'off'));

const make = () =>
  defineFeatures({
    inputs: { flags: input<{ a: boolean }>(), tenant: input<{ t: string }>() },
    features: {
      mode: {
        reads: { flags: ['a'] },
        output: z.enum(['on', 'off']),
        resolve: resolveSpy as (i: { flags: { a: boolean }; tenant: { t: string } }) => 'on' | 'off',
      },
      label: {
        reads: { tenant: ['t'] },
        output: z.string(),
        resolve: ({ tenant }) => tenant.t,
      },
    },
  });

describe('graph', () => {
  it('returns declared edges without executing resolvers', () => {
    resolveSpy.mockClear();
    expect(make().graph()).toEqual({
      mode: { flags: ['a'] },
      label: { tenant: ['t'] },
    });
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});

describe('builder', () => {
  const baseline = { flags: { a: false }, tenant: { t: 'base' } };

  it('produces full state from the baseline', () => {
    const build = make().builder(baseline);
    expect(build()).toEqual({ mode: 'off', label: 'base' });
  });

  it('patches overrides onto baseline state', () => {
    const build = make().builder(baseline);
    expect(build({ mode: 'on' })).toEqual({ mode: 'on', label: 'base' });
  });

  it('resolves the baseline only once across builds', () => {
    resolveSpy.mockClear();
    const build = make().builder(baseline);
    build();
    build({ mode: 'on' });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
  });
});
