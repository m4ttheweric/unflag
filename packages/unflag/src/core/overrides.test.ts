import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { applyOverrides, defineFeatures, input, SCHEMAS } from '../index';

const make = () =>
  defineFeatures({
    inputs: { flags: input<{ a: boolean }>() },
    features: {
      chatExperience: {
        reads: { flags: ['a'] },
        output: z.enum(['claim-chat', 'emma-chat', 'disabled']),
        resolve: ({ flags }) => (flags.a ? 'claim-chat' : 'disabled'),
      },
    },
  });

const base = () => make().resolve({ flags: { a: false } });

describe('applyOverrides', () => {
  it('applies a valid override and records provenance', () => {
    const patched = applyOverrides(base(), { chatExperience: 'emma-chat' });
    expect(patched.state.chatExperience).toBe('emma-chat');
    expect(patched.provenance.chatExperience.overridden).toBe(true);
    expect(patched.provenance.chatExperience.underlying).toBe('disabled');
  });

  it('does not mutate the input result', () => {
    const original = base();
    applyOverrides(original, { chatExperience: 'emma-chat' });
    expect(original.state.chatExperience).toBe('disabled');
    expect(original.provenance.chatExperience.overridden).toBe(false);
  });

  it('discards a stale value for a known feature, keeping resolved state', () => {
    const patched = applyOverrides(base(), { chatExperience: 'retired-variant' });
    expect(patched.state.chatExperience).toBe('disabled');
    expect(patched.provenance.chatExperience.overridden).toBe(false);
    expect(patched.provenance.chatExperience.staleOverrideDiscarded).toMatchObject({
      attempted: 'retired-variant',
    });
  });

  it('discards even in prod (overrides are untrusted input)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const patched = applyOverrides(base(), { chatExperience: 'retired-variant' });
    expect(patched.state.chatExperience).toBe('disabled');
    vi.unstubAllEnvs();
  });

  it('records unknown feature keys in discardedOverrides', () => {
    const patched = applyOverrides(base(), { removedFeature: true });
    expect(patched.discardedOverrides?.removedFeature).toMatchObject({ attempted: true });
  });

  it('re-attaches the SCHEMAS ref so applyOverrides composes', () => {
    const once = applyOverrides(base(), { chatExperience: 'emma-chat' });
    const twice = applyOverrides(once, { chatExperience: 'claim-chat' });
    expect(twice.state.chatExperience).toBe('claim-chat');
    expect((twice as any)[SCHEMAS]).toBeDefined();
  });

  it('throws if the result carries no SCHEMAS ref', () => {
    expect(() =>
      applyOverrides({ state: {}, provenance: {} } as never, {}),
    ).toThrowError(/\[unflag\] applyOverrides requires a ResolveResult produced by resolve\(\)/);
  });
});
