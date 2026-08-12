import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input, SCHEMAS } from '../index';

type Flags = { 'emma-adjuster-chat': boolean; 'case-view-claim-chat-tab': boolean };
type Tenant = { chatSurface: 'tab' | 'drawer' };

const make = () =>
  defineFeatures({
    inputs: { flags: input<Flags>(), tenant: input<Tenant>() },
    features: {
      chatExperience: {
        reads: { flags: ['emma-adjuster-chat', 'case-view-claim-chat-tab'] },
        output: z.enum(['claim-chat', 'emma-chat', 'disabled']),
        resolve: ({ flags }) =>
          !flags['emma-adjuster-chat'] ? 'disabled'
          : flags['case-view-claim-chat-tab'] ? 'claim-chat'
          : 'emma-chat',
      },
      chatSurface: {
        reads: { tenant: ['chatSurface'] },
        output: z.enum(['tab', 'drawer']),
        resolve: ({ tenant }) => tenant.chatSurface,
      },
    },
  });

const inputs = {
  flags: { 'emma-adjuster-chat': true, 'case-view-claim-chat-tab': false },
  tenant: { chatSurface: 'tab' as const },
};

describe('defineFeatures/resolve', () => {
  it('resolves every feature into state', () => {
    const result = make().resolve(inputs);
    expect(result.state).toEqual({ chatExperience: 'emma-chat', chatSurface: 'tab' });
  });

  it('exposes schemas on the set and on the result via SCHEMAS symbol', () => {
    const set = make();
    const result = set.resolve(inputs);
    expect(set.schemas.chatExperience).toBeDefined();
    expect((result as any)[SCHEMAS].chatExperience).toBe(set.schemas.chatExperience);
  });

  it('SCHEMAS is not enumerable on the result', () => {
    const result = make().resolve(inputs);
    expect(Object.keys(result)).toEqual(['state', 'provenance']);
  });
});
