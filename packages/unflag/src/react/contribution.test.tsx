import { render, screen, act } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, input } from '../index';
import { createUnflagReact } from './index';

type Strategy = { mode: 'full' | 'lite' } | null;

const featureSet = defineFeatures({
  inputs: { flags: input<{ chat: boolean }>(), strategy: deferredInput<Strategy>() },
  features: {
    offered: {
      reads: { flags: ['chat'] },
      output: z.boolean(),
      resolve: ({ flags }) => flags.chat,
    },
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'off', 'none']),
      unready: 'off',
      resolve: ({ strategy }) => strategy?.mode ?? 'none',
    },
  },
});

const { UnflagProvider, useFeatures, useProvideInput } = createUnflagReact(featureSet);

function Show() {
  const { chatMode } = useFeatures();
  return <div data-testid="mode">{chatMode}</div>;
}

function Contributor({ value }: { value: Strategy | undefined }) {
  useProvideInput('strategy', value);
  return null;
}

const app = (children: React.ReactNode) => (
  <UnflagProvider inputs={{ flags: { chat: true } }}>
    <Show />
    {children}
  </UnflagProvider>
);

describe('useProvideInput', () => {
  it('serves the unready fallback before any contribution', () => {
    render(app(null));
    expect(screen.getByTestId('mode').textContent).toBe('off');
  });

  it('a contribution re-resolves with the real value', () => {
    const { rerender } = render(app(<Contributor value={undefined} />));
    expect(screen.getByTestId('mode').textContent).toBe('off');
    rerender(app(<Contributor value={{ mode: 'full' }} />));
    expect(screen.getByTestId('mode').textContent).toBe('full');
  });

  it('a null contribution is a real settled value, not absence', () => {
    render(app(<Contributor value={null} />));
    expect(screen.getByTestId('mode').textContent).toBe('none');
  });

  it('same-value re-contribution does not re-resolve (loop safety)', () => {
    const resolveSpy = vi.spyOn(featureSet, 'resolve');
    const stable: Strategy = { mode: 'full' };
    function Flipper() {
      const [, force] = useState(0);
      (window as { __force?: () => void }).__force = () => force(n => n + 1);
      return <Contributor value={stable} />;
    }
    render(app(<Flipper />));
    const countAfterMount = resolveSpy.mock.calls.length;
    act(() => (window as { __force?: () => void }).__force!());
    expect(resolveSpy.mock.calls.length).toBe(countAfterMount);
    resolveSpy.mockRestore();
  });

  it('passing undefined after a value withdraws it (revert to unready)', () => {
    const { rerender } = render(app(<Contributor value={{ mode: 'lite' }} />));
    expect(screen.getByTestId('mode').textContent).toBe('lite');
    rerender(app(<Contributor value={undefined} />));
    expect(screen.getByTestId('mode').textContent).toBe('off');
  });

  it('unmounting the contributor withdraws its contribution', () => {
    const { rerender } = render(app(<Contributor value={{ mode: 'lite' }} />));
    expect(screen.getByTestId('mode').textContent).toBe('lite');
    rerender(app(null));
    expect(screen.getByTestId('mode').textContent).toBe('off');
  });

  it('two live contributors warn and last write wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      app(
        <>
          <Contributor value={{ mode: 'full' }} />
          <Contributor value={{ mode: 'lite' }} />
        </>,
      ),
    );
    expect(screen.getByTestId('mode').textContent).toBe('lite');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('live contributors; last write wins'));
    warn.mockRestore();
  });

  it('warns in dev when a contribution churns identity every render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function FreshObject({ n }: { n: number }) {
      // deliberately unmemoized: a new object identity every render
      useProvideInput('strategy', { mode: 'full' });
      return <span data-testid="n">{n}</span>;
    }
    const { rerender } = render(app(<FreshObject n={0} />));
    for (let i = 1; i <= 5; i += 1) rerender(app(<FreshObject n={i} />));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changes identity every render'));
    warn.mockRestore();
  });

  it('drops churning contributions after the warning fires (breaker)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Force internal re-renders (like the loop-safety test above) rather than calling
    // rerender(app(...)) repeatedly: app() builds a fresh `inputs` object literal on every
    // call, which would itself cause featureSet.resolve to re-run and confound the count.
    function FreshObject() {
      const [, force] = useState(0);
      (window as { __force?: () => void }).__force = () => force(n => n + 1);
      // deliberately unmemoized: a new object identity every render
      useProvideInput('strategy', { mode: 'full' });
      return null;
    }
    render(app(<FreshObject />));
    for (let i = 0; i < 5; i += 1) act(() => (window as { __force?: () => void }).__force!());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changes identity every render'));
    warn.mockClear();

    // Degradation lands on the designed no-contribution state (spec 2.2), not the last
    // value that was accepted before the breaker engaged.
    expect(screen.getByTestId('mode').textContent).toBe('off');

    const resolveSpy = vi.spyOn(featureSet, 'resolve');
    const countAfterWarning = resolveSpy.mock.calls.length;
    act(() => (window as { __force?: () => void }).__force!());
    act(() => (window as { __force?: () => void }).__force!());
    expect(resolveSpy.mock.calls.length).toBe(countAfterWarning);
    expect(screen.getByTestId('mode').textContent).toBe('off');
    resolveSpy.mockRestore();
    warn.mockRestore();
  });

  it('re-feeds the last contributed value once the churn quiets down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    function FreshObject() {
      const [, force] = useState(0);
      (window as { __force?: () => void }).__force = () => force(v => v + 1);
      n += 1;
      // deliberately unmemoized: a new object identity every distinct-identity render
      useProvideInput('strategy', { mode: n % 2 === 0 ? 'full' : 'lite' });
      return null;
    }
    render(app(<FreshObject />));
    for (let i = 0; i < 6; i += 1) act(() => (window as { __force?: () => void }).__force!());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changes identity every render'));

    // Breaker engaged: the feature is stranded on the unready fallback even though the
    // app believes the contribution landed.
    expect(screen.getByTestId('mode').textContent).toBe('off');

    // Wait out the quiet window: the last-seen value should be re-fed automatically.
    await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
    expect(screen.getByTestId('mode').textContent).toBe(n % 2 === 0 ? 'full' : 'lite');

    warn.mockRestore();
  });

  it('does not resurrect a churning contribution if the contributor unmounted before the quiet window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    function FreshObject() {
      const [, force] = useState(0);
      (window as { __force?: () => void }).__force = () => force(v => v + 1);
      n += 1;
      // deliberately unmemoized: a new object identity every distinct-identity render
      useProvideInput('strategy', { mode: n % 2 === 0 ? 'full' : 'lite' });
      return null;
    }
    const { rerender } = render(app(<FreshObject />));
    for (let i = 0; i < 6; i += 1) act(() => (window as { __force?: () => void }).__force!());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changes identity every render'));
    expect(screen.getByTestId('mode').textContent).toBe('off');

    // Unmount the contributor before the quiet window closes.
    act(() => rerender(app(null)));

    await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
    expect(screen.getByTestId('mode').textContent).toBe('off');

    warn.mockRestore();
  });

  it('the churn warning stays silent for a stable value across many rerenders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stable: Strategy = { mode: 'full' };
    const { rerender } = render(app(<Contributor value={stable} />));
    for (let i = 1; i <= 5; i += 1) rerender(app(<Contributor value={stable} />));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a host-provided deferred input resolves features with no contributor present (spec 2.2)', () => {
    render(
      <UnflagProvider inputs={{ flags: { chat: true }, strategy: { mode: 'full' } }}>
        <Show />
      </UnflagProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('full');
  });

  it('a contribution shadows a host-provided deferred input, wins, and warns once in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <UnflagProvider inputs={{ flags: { chat: true }, strategy: { mode: 'full' } }}>
        <Show />
        <Contributor value={{ mode: 'lite' }} />
      </UnflagProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('lite');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[unflag] input "strategy" was provided by the host and is now shadowed by a useProvideInput contribution; the contribution wins',
      ),
    );
    warn.mockRestore();
  });

  it('the shadow warning does not fire when the host did not provide the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(app(<Contributor value={{ mode: 'lite' }} />));
    expect(screen.getByTestId('mode').textContent).toBe('lite');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('was provided by the host'));
    warn.mockRestore();
  });

  it('types: only deferred input keys are contributable', () => {
    function Bad() {
      // @ts-expect-error 'flags' is a plain input, not deferred
      useProvideInput('flags', { chat: true });
      return null;
    }
    expect(Bad).toBeDefined();
  });
});
