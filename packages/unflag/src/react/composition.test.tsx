import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, fromFeatureSet, input } from '../index';
import { createUnflagReact } from './index';

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

const App = createUnflagReact(appSet);
const Case = createUnflagReact(caseSet);

function Show() {
  const { chatOffered } = Case.useFeatures();
  return <div data-testid="offered">{String(chatOffered)}</div>;
}
let caseHandle: ReturnType<typeof Case.useUnflag>;
function Capture() {
  caseHandle = Case.useUnflag();
  return null;
}

describe('nested providers', () => {
  it('auto-injects the parent state; the child inputs prop omits fromSet keys', () => {
    render(
      <App.UnflagProvider inputs={{ flags: { chat: true } }}>
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <Show />
          <Capture />
        </Case.UnflagProvider>
      </App.UnflagProvider>,
    );
    expect(screen.getByTestId('offered').textContent).toBe('true');
  });

  it('re-resolves the child when the parent inputs change', () => {
    const tree = (chat: boolean) => (
      <App.UnflagProvider inputs={{ flags: { chat } }}>
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <Show />
        </Case.UnflagProvider>
      </App.UnflagProvider>
    );
    const { rerender } = render(tree(true));
    expect(screen.getByTestId('offered').textContent).toBe('true');
    rerender(tree(false));
    expect(screen.getByTestId('offered').textContent).toBe('false');
  });

  it('exposes the parent chain on context for the dev panel', () => {
    render(
      <App.UnflagProvider inputs={{ flags: { chat: true } }}>
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <Capture />
        </Case.UnflagProvider>
      </App.UnflagProvider>,
    );
    expect(caseHandle.parents).toHaveLength(1);
    expect(caseHandle.parents[0]!.label).toBe('app');
    expect(caseHandle.parents[0]!.ctx.result.state).toEqual({ chatEnabled: true });
  });

  it('throws a duplicate-copy-aware error when the ancestor provider is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <Show />
        </Case.UnflagProvider>,
      ),
    ).toThrowError(/no ancestor UnflagProvider .* two copies of unflag/s);
    spy.mockRestore();
  });

  it('keeps the child context value identity stable across child-host re-renders when nothing changed', () => {
    const seen: Array<ReturnType<typeof Case.useUnflag>> = [];
    function CaptureIdentity() {
      seen.push(Case.useUnflag());
      return null;
    }
    const appInputs = { flags: { chat: true } };
    const caseInputs = { gates: { shell: false } };
    function Host() {
      const [, force] = React.useState(0);
      (window as { __forceHost?: () => void }).__forceHost = () => force(n => n + 1);
      return (
        <Case.UnflagProvider inputs={caseInputs}>
          <CaptureIdentity />
        </Case.UnflagProvider>
      );
    }
    render(
      <App.UnflagProvider inputs={appInputs}>
        <Host />
      </App.UnflagProvider>,
    );
    act(() => (window as { __forceHost?: () => void }).__forceHost!());
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });

  it('types: the child inputs prop rejects the fromSet key', () => {
    // @ts-expect-error 'app' is auto-injected and not accepted on the provider
    const el = <Case.UnflagProvider inputs={{ app: { chatEnabled: true }, gates: { shell: false } }} />;
    expect(el).toBeDefined();
  });
});
