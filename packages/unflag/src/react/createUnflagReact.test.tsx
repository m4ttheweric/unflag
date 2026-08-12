import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input } from '../index';
import { createUnflagReact } from './index';

const featureSet = defineFeatures({
  inputs: { flags: input<{ chat: boolean }>() },
  features: {
    chatExperience: {
      reads: { flags: ['chat'] },
      output: z.enum(['emma-chat', 'disabled']),
      resolve: ({ flags }) => (flags.chat ? 'emma-chat' : 'disabled'),
    },
  },
});

const { UnflagProvider, useFeatures, useUnflag } = createUnflagReact(featureSet);

function Show() {
  const features = useFeatures();
  return <div data-testid="value">{features.chatExperience}</div>;
}

let handle: ReturnType<typeof useUnflag>;
function Capture() {
  handle = useUnflag();
  return null;
}

const renderApp = (props?: { enableOverrides?: boolean; storageKey?: string; chat?: boolean }) =>
  render(
    <UnflagProvider
      inputs={{ flags: { chat: props?.chat ?? false } }}
      enableOverrides={props?.enableOverrides}
      storageKey={props?.storageKey}
    >
      <Show />
      <Capture />
    </UnflagProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
});

describe('createUnflagReact', () => {
  it('useFeatures returns resolved state', () => {
    renderApp({ chat: true });
    expect(screen.getByTestId('value').textContent).toBe('emma-chat');
  });

  it('useFeatures throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Show />)).toThrowError(
      '[unflag] useFeatures must be used within its UnflagProvider',
    );
    spy.mockRestore();
  });

  it('setOverride patches state when overrides are enabled', () => {
    renderApp({ enableOverrides: true });
    act(() => handle.setOverride('chatExperience', 'emma-chat'));
    expect(screen.getByTestId('value').textContent).toBe('emma-chat');
    expect(handle.overridesEnabled).toBe(true);
  });

  it('persists overrides to localStorage and rehydrates', () => {
    renderApp({ enableOverrides: true, storageKey: 'unflag.test' });
    act(() => handle.setOverride('chatExperience', 'emma-chat'));
    expect(JSON.parse(window.localStorage.getItem('unflag.test')!)).toEqual({
      chatExperience: 'emma-chat',
    });
    renderApp({ enableOverrides: true, storageKey: 'unflag.test' });
    expect(screen.getAllByTestId('value')[1]!.textContent).toBe('emma-chat');
  });

  it('never touches localStorage when overrides are disabled', () => {
    window.localStorage.setItem('unflag.test', JSON.stringify({ chatExperience: 'emma-chat' }));
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    renderApp({ storageKey: 'unflag.test' });
    expect(screen.getByTestId('value').textContent).toBe('disabled');
    expect(getItem).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it('setOverride throws in dev when overrides are disabled', () => {
    renderApp();
    expect(() => act(() => handle.setOverride('chatExperience', 'emma-chat'))).toThrowError(
      '[unflag] setOverride called but overrides are not enabled on this UnflagProvider',
    );
  });

  it('clearOverride and clearAll restore resolved state', () => {
    renderApp({ enableOverrides: true });
    act(() => handle.setOverride('chatExperience', 'emma-chat'));
    act(() => handle.clearOverride('chatExperience'));
    expect(screen.getByTestId('value').textContent).toBe('disabled');
    act(() => handle.setOverride('chatExperience', 'emma-chat'));
    act(() => handle.clearAll());
    expect(screen.getByTestId('value').textContent).toBe('disabled');
    expect(JSON.parse(window.localStorage.getItem('unflag') ?? '{}')).toEqual({});
  });

  it('exposes explain through the handle', () => {
    renderApp({ chat: true });
    expect(handle.explain('chatExperience')).toBe(
      `chatExperience = "emma-chat" (flags['chat'] = true)`,
    );
  });
});
