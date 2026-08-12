import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input } from '../../index';
import { createUnflagReact } from '../index';
import { UnflagDevPanel } from './index';

const featureSet = defineFeatures({
  inputs: { flags: input<{ chat: boolean; beta: boolean }>() },
  features: {
    chatExperience: {
      reads: { flags: ['chat'] },
      output: z.enum(['emma-chat', 'disabled']),
      resolve: ({ flags }) => (flags.chat ? 'emma-chat' : 'disabled'),
    },
    betaBanner: {
      reads: { flags: ['beta'] },
      output: z.boolean(),
      resolve: ({ flags }) => flags.beta,
    },
    limits: {
      reads: {},
      output: z.object({ maxOpen: z.number() }),
      resolve: () => ({ maxOpen: 5 }),
    },
    releaseDate: {
      reads: {},
      output: z.date(),
      resolve: () => new Date(0),
    },
  },
});

const { UnflagProvider, useUnflag } = createUnflagReact(featureSet);

const renderPanel = () =>
  render(
    <UnflagProvider inputs={{ flags: { chat: false, beta: true } }} enableOverrides storageKey="unflag.panel">
      <UnflagDevPanel useUnflag={useUnflag} />
    </UnflagProvider>,
  );

beforeEach(() => window.localStorage.clear());

describe('UnflagDevPanel', () => {
  it('opens from the trigger and lists every feature with its value', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    expect(screen.getByText('chatExperience')).toBeDefined();
    expect(screen.getByText('"disabled"')).toBeDefined();
    expect(screen.getByText('betaBanner')).toBeDefined();
    expect(screen.getByText('limits')).toBeDefined();
  });

  it('renders a selector for enum features and applies an override', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await userEvent.click(screen.getByRole('button', { name: 'emma-chat' }));
    expect(screen.getByText('overridden')).toBeDefined();
    expect(screen.getByText('"emma-chat"')).toBeDefined();
  });

  it('renders a toggle for boolean features', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    const toggle = screen.getByRole('checkbox', { name: 'override betaBanner' });
    await userEvent.click(toggle);
    expect(screen.getByText('overridden')).toBeDefined();
  });

  it('renders a JSON editor for object features and rejects invalid JSON', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    const editor = screen.getByRole('textbox', { name: 'override limits' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'not json');
    await userEvent.tab();
    expect(screen.getByText(/invalid/i)).toBeDefined();
    expect(screen.queryByText('overridden')).toBeNull();
  });

  it('clear-all removes overrides', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await userEvent.click(screen.getByRole('button', { name: 'emma-chat' }));
    await userEvent.click(screen.getByRole('button', { name: 'clear all overrides' }));
    expect(screen.queryByText('overridden')).toBeNull();
  });

  it('shows explain output in the provenance expander', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await userEvent.click(screen.getByRole('button', { name: 'why chatExperience' }));
    expect(
      screen.getByText(`chatExperience = "disabled" (flags['chat'] = false)`),
    ).toBeDefined();
  });

  it('resyncs the JSON editor to external value changes and does not re-apply stale text on blur after clear-all', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    const editor = screen.getByRole('textbox', { name: 'override limits' }) as HTMLTextAreaElement;

    await userEvent.clear(editor);
    await userEvent.paste('{"maxOpen": 9}');
    await userEvent.tab();
    expect(screen.getByText('overridden')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'clear all overrides' }));
    expect(screen.queryByText('overridden')).toBeNull();
    expect(editor.value).toBe(JSON.stringify({ maxOpen: 5 }, null, 2));

    await userEvent.click(editor);
    await userEvent.tab();
    expect(screen.queryByText('overridden')).toBeNull();
    expect(window.localStorage.getItem('unflag.panel')).toBeNull();
  });

  it('falls back to a JSON editor for schemas that z.toJSONSchema cannot represent', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    expect(screen.getByText('releaseDate')).toBeDefined();
    expect(screen.getByText('chatExperience')).toBeDefined();
    expect(screen.getByText('betaBanner')).toBeDefined();
    expect(screen.getByText('limits')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'override releaseDate' })).toBeDefined();
  });
});
