import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, input } from '../index';
import { createUnflagReact } from './index';

type Strategy = { mode: 'full' | 'lite' } | null;

const featureSet = defineFeatures({
  inputs: { flags: input<{ chat: boolean }>(), strategy: deferredInput<Strategy>() },
  features: {
    offered: { reads: { flags: ['chat'] }, output: z.boolean(), resolve: ({ flags }) => flags.chat },
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'off', 'none']),
      unready: 'off',
      resolve: ({ strategy }) => strategy?.mode ?? 'none',
    },
  },
});

const { UnflagProvider, useFeatureStatus, useUnflag, useProvideInput } = createUnflagReact(featureSet);

let statusHandle: ReturnType<typeof useFeatureStatus<'chatMode'>>;
let unflagHandle: ReturnType<typeof useUnflag>;
function Capture() {
  statusHandle = useFeatureStatus('chatMode');
  unflagHandle = useUnflag();
  return null;
}
function Contributor({ value }: { value: Strategy | undefined }) {
  useProvideInput('strategy', value);
  return null;
}

describe('useFeatureStatus / statuses', () => {
  it('reports unready with the fallback as value, then ready with the real value', () => {
    const { rerender } = render(
      <UnflagProvider inputs={{ flags: { chat: true } }}>
        <Capture />
        <Contributor value={undefined} />
      </UnflagProvider>,
    );
    expect(statusHandle).toEqual({ status: 'unready', value: 'off' });
    expect(unflagHandle.statuses).toEqual({ offered: 'ready', chatMode: 'unready' });
    rerender(
      <UnflagProvider inputs={{ flags: { chat: true } }}>
        <Capture />
        <Contributor value={{ mode: 'full' }} />
      </UnflagProvider>,
    );
    expect(statusHandle).toEqual({ status: 'ready', value: 'full' });
    expect(unflagHandle.statuses.chatMode).toBe('ready');
  });

  it('an override beats an unready fallback and reads as ready-valued state (spec 2.2 ordering)', () => {
    render(
      <UnflagProvider inputs={{ flags: { chat: true } }} enableOverrides storageKey="unflag.featureStatus.overrideBeatsUnready">
        <Capture />
      </UnflagProvider>,
    );
    act(() => unflagHandle.setOverride('chatMode', 'lite'));
    expect(statusHandle.value).toBe('lite');
  });

  it('an overridden unready feature reports status ready, and reverts to unready once the override is cleared', () => {
    render(
      <UnflagProvider inputs={{ flags: { chat: true } }} enableOverrides storageKey="unflag.featureStatus.overriddenUnready">
        <Capture />
      </UnflagProvider>,
    );
    expect(statusHandle).toEqual({ status: 'unready', value: 'off' });
    act(() => unflagHandle.setOverride('chatMode', 'lite'));
    expect(statusHandle).toEqual({ status: 'ready', value: 'lite' });
    expect(unflagHandle.statuses.chatMode).toBe('ready');
    act(() => unflagHandle.clearOverride('chatMode'));
    expect(statusHandle).toEqual({ status: 'unready', value: 'off' });
  });
});
