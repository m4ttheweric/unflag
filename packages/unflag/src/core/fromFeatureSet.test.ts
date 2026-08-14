import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, fromFeatureSet, input, type InferState } from '../index';

const appSet = defineFeatures({
  inputs: { flags: input<{ chat: boolean }>() },
  features: {
    chatEnabled: { reads: { flags: ['chat'] }, output: z.boolean(), resolve: ({ flags }) => flags.chat },
  },
});

const caseSet = defineFeatures({
  inputs: { app: fromFeatureSet(appSet), gates: input<{ shell: boolean }>() },
  features: {
    chatOffered: {
      reads: { app: ['chatEnabled'], gates: ['shell'] },
      output: z.boolean(),
      resolve: ({ app, gates }) => app.chatEnabled && !gates.shell,
    },
  },
});

describe('fromFeatureSet', () => {
  it('types the input as the parent state and carries the set reference at runtime', () => {
    expectTypeOf(caseSet.inputs.app).toMatchTypeOf<{ readonly __unflag: 'fromSet' }>();
    expect((caseSet.inputs.app as { __set: unknown }).__set).toBe(appSet);
  });

  it('resolves with the parent state passed explicitly (imperative path, typed plumbing)', () => {
    const appState = appSet.resolve({ flags: { chat: true } }).state;
    expectTypeOf(appState).toEqualTypeOf<InferState<typeof appSet>>();
    const result = caseSet.resolve({ app: appState, gates: { shell: false } });
    expect(result.state.chatOffered).toBe(true);
  });

  it('is a required input: omission is a type error and a runtime error', () => {
    // @ts-expect-error 'app' is required (fromSet inputs are plain, not deferred)
    expect(() => caseSet.resolve({ gates: { shell: false } })).toThrowError(
      /missing required input\(s\) app/,
    );
  });

  it('participates in resolvePartial subsetting like any input', () => {
    const { state } = caseSet.resolvePartial({ gates: { shell: false } });
    expect('chatOffered' in state).toBe(false);
  });
});
