import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, deferredInput, fromFeatureSet, input } from '../../index';
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
    big: {
      reads: {},
      output: z.bigint(),
      resolve: () => 10n,
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

/** Mutates an override from outside the panel, so no row has to be expanded to do it. */
function ExternalMutator() {
  const unflag = useUnflag();
  return (
    <button type="button" onClick={() => unflag.setOverride('betaBanner', false)}>
      override betaBanner externally
    </button>
  );
}

const renderPanelWithExternalMutator = () =>
  render(
    <UnflagProvider inputs={{ flags: { chat: false, beta: true } }} enableOverrides storageKey="unflag.panel">
      <ExternalMutator />
      <UnflagDevPanel useUnflag={useUnflag} />
    </UnflagProvider>,
  );

/**
 * Rows are collapsed by default, so every test that touches a feature's controls
 * (override chips, toggle, JSON editor, why?) has to expand its row first. The row
 * button's accessible name is its content -- name plus value preview -- so match on
 * the leading feature name only. `\b` keeps `stress2` from matching `stress20`.
 */
const rowButton = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });

const expandRow = (name: string) => userEvent.click(rowButton(name));

const openPanel = () => userEvent.click(screen.getByRole('button', { name: 'unflag' }));

const filterInput = () => screen.getByRole('searchbox', { name: 'filter features' });

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
    await expandRow('chatExperience');
    await userEvent.click(screen.getByRole('button', { name: 'emma-chat' }));
    expect(screen.getByText('overridden')).toBeDefined();
    expect(screen.getByText('"emma-chat"')).toBeDefined();
  });

  it('renders a toggle for boolean features', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('betaBanner');
    const toggle = screen.getByRole('checkbox', { name: 'override betaBanner' });
    await userEvent.click(toggle);
    expect(screen.getByText('overridden')).toBeDefined();
  });

  it('renders a JSON editor for object features and rejects invalid JSON', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('limits');
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
    await expandRow('chatExperience');
    await userEvent.click(screen.getByRole('button', { name: 'emma-chat' }));
    await userEvent.click(screen.getByRole('button', { name: 'clear all overrides' }));
    expect(screen.queryByText('overridden')).toBeNull();
  });

  it('shows explain output in the provenance expander', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('chatExperience');
    await userEvent.click(screen.getByRole('button', { name: 'why chatExperience' }));
    expect(
      screen.getByText(`chatExperience = "disabled" (flags['chat'] = false)`),
    ).toBeDefined();
  });

  it('resyncs the JSON editor to external value changes and does not re-apply stale text on blur after clear-all', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('limits');
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

  it('does not wipe in-progress unsaved edits when an unrelated feature changes', async () => {
    renderPanelWithExternalMutator();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('limits');
    const editor = screen.getByRole('textbox', { name: 'override limits' }) as HTMLTextAreaElement;

    // Apply an override on limits so its `value` prop is now overridden-derived.
    await userEvent.clear(editor);
    await userEvent.paste('{"maxOpen": 9}');
    await userEvent.tab();
    expect(screen.getByText('overridden')).toBeDefined();

    // Start editing again, but do NOT blur -- this is in-progress, unsaved text.
    await userEvent.click(editor);
    await userEvent.clear(editor);
    await userEvent.paste('{"maxOpen": 123');

    // Override an unrelated feature. This changes the `overrides` map (new reference),
    // which recomputes `result` and gives every provenance entry -- including limits' --
    // a fresh (but content-equal) object, even though limits' own override didn't change.
    // Driven from outside the panel because rows are an accordion now: expanding another
    // row to reach its control would unmount this editor, which is not what's under test.
    await userEvent.click(screen.getByRole('button', { name: 'override betaBanner externally' }));

    expect(editor.value).toBe('{"maxOpen": 123');
  });

  it('falls back to a JSON editor for schemas that z.toJSONSchema cannot represent', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    expect(screen.getByText('releaseDate')).toBeDefined();
    expect(screen.getByText('chatExperience')).toBeDefined();
    expect(screen.getByText('betaBanner')).toBeDefined();
    expect(screen.getByText('limits')).toBeDefined();
    await expandRow('releaseDate');
    expect(screen.getByRole('textbox', { name: 'override releaseDate' })).toBeDefined();
  });

  it('renders every row, including a BigInt-valued feature, without JSON.stringify throwing', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    expect(screen.getByText('big')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    await expandRow('big');
    expect(screen.getByRole('textbox', { name: 'override big' })).toBeDefined();
  });

  it('does not crash blurring the JSON editor for a BigInt-valued feature (z.bigint() is unrepresentable as JSON Schema, so JsonEditor is the control that renders)', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'unflag' }));
    await expandRow('big');
    const editor = screen.getByRole('textbox', { name: 'override big' }) as HTMLTextAreaElement;

    await userEvent.clear(editor);
    await userEvent.type(editor, '10');
    await expect(userEvent.tab()).resolves.not.toThrow();

    // Panel survived the blur and is still rendering the row -- the no-op guard's
    // comparison must not throw for a BigInt-valued feature.
    expect(screen.getByText('big')).toBeDefined();
    expect(screen.queryByText(/invalid/i)).toBeNull();
    // safeStringify(10) and safeStringify(10n) both produce the text "10", so the no-op
    // guard treats parsed `10` (number) as textually equal to the underlying `10n` and
    // does NOT call onApply here -- no override gets created for same-looking text.
    expect(screen.queryByText('overridden')).toBeNull();
  });

  it('renders parent sections above the child set when providers are nested', async () => {
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

    render(
      <App.UnflagProvider inputs={{ flags: { chat: true } }}>
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <UnflagDevPanel useUnflag={Case.useUnflag} />
        </Case.UnflagProvider>
      </App.UnflagProvider>,
    );
    await openPanel();

    const sectionHeader = screen.getByText('app');
    const parentRow = screen.getByText('chatEnabled');
    const childRow = screen.getByText('chatOffered');

    expect(sectionHeader).toBeDefined();
    expect(parentRow).toBeDefined();
    expect(childRow).toBeDefined();

    // DOM order: the 'app' section (header + its row) precedes the child's own rows.
    expect(
      sectionHeader.compareDocumentPosition(childRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      parentRow.compareDocumentPosition(childRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides a section header when the filter leaves zero visible rows in that section', async () => {
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

    render(
      <App.UnflagProvider inputs={{ flags: { chat: true } }}>
        <Case.UnflagProvider inputs={{ gates: { shell: false } }}>
          <UnflagDevPanel useUnflag={Case.useUnflag} />
        </Case.UnflagProvider>
      </App.UnflagProvider>,
    );
    await openPanel();

    // Filter matches only the child set's feature name, so the parent 'app' section
    // has zero visible rows and its header should not render at all.
    await userEvent.type(filterInput(), 'chatOffered');

    expect(screen.getByText('chatOffered')).toBeDefined();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('badges unready features', async () => {
    const unreadySet = defineFeatures({
      inputs: {
        flags: input<{ chat: boolean }>(),
        strategy: deferredInput<{ mode: 'full' | 'lite' } | null>(),
      },
      features: {
        offered: { reads: { flags: ['chat'] }, output: z.boolean(), resolve: ({ flags }) => flags.chat },
        chatMode: {
          reads: { flags: ['chat'], strategy: ['mode'] },
          output: z.enum(['full', 'lite', 'off']),
          unready: 'off',
          resolve: ({ flags, strategy }) => (!flags.chat || !strategy ? 'off' : strategy.mode),
        },
      },
    });
    const { UnflagProvider: UnreadyProvider, useUnflag: useUnreadyUnflag } = createUnflagReact(unreadySet);

    render(
      <UnreadyProvider inputs={{ flags: { chat: true } }}>
        <UnflagDevPanel useUnflag={useUnreadyUnflag} />
      </UnreadyProvider>,
    );
    await openPanel();

    expect(within(rowButton('chatMode')).getByText('unready')).toBeDefined();
    expect(within(rowButton('offered')).queryByText('unready')).toBeNull();
  });
});

// Dynamic feature keys defeat the literal-object inference path of `defineFeatures`,
// so the record is built loosely and cast at the boundary -- the point here is a
// many-row panel, not static inference.
type StressDef = {
  reads: { dial: readonly [string] };
  output: z.ZodType;
  resolve: (inputs: { dial: Record<string, boolean> }) => unknown;
};

function buildStressFeatures(count: number) {
  const features: Record<string, StressDef> = {};
  const dial: Record<string, boolean> = {};
  for (let i = 0; i < count; i++) {
    const dialKey = `d${i}`;
    dial[dialKey] = i % 2 === 0;
    const kind = i % 3;
    features[`stress${i}`] =
      kind === 0
        ? {
            reads: { dial: [dialKey] },
            output: z.enum(['alpha', 'bravo']),
            resolve: ({ dial: d }) => (d[dialKey] ? 'alpha' : 'bravo'),
          }
        : kind === 1
          ? {
              reads: { dial: [dialKey] },
              output: z.boolean(),
              resolve: ({ dial: d }) => Boolean(d[dialKey]),
            }
          : {
              reads: { dial: [dialKey] },
              output: z.object({ items: z.array(z.object({ id: z.number(), label: z.string() })) }),
              resolve: ({ dial: d }) => ({
                items: Array.from({ length: 40 }, (_, j) => ({
                  id: i * 100 + j,
                  label: `stress${i}-item${j}-${d[dialKey] ? 'on' : 'off'}`,
                })),
              }),
            };
  }
  return { featureSet: defineFeatures({ inputs: { dial: input<Record<string, boolean>>() }, features } as never), dial };
}

describe('UnflagDevPanel with large feature sets', () => {
  it('filters the visible rows by a case-insensitive substring of the feature name', async () => {
    renderPanel();
    await openPanel();

    await userEvent.type(filterInput(), 'BET');

    expect(screen.getByText('betaBanner')).toBeDefined();
    expect(screen.queryByText('chatExperience')).toBeNull();
    expect(screen.queryByText('limits')).toBeNull();
    expect(screen.queryByText('releaseDate')).toBeNull();
  });

  it('says so when the filter matches nothing', async () => {
    renderPanel();
    await openPanel();

    await userEvent.type(filterInput(), 'nosuchfeature');

    expect(screen.getByText('no features match')).toBeDefined();
    expect(screen.getByText('5 features · 0 overridden · 0 shown')).toBeDefined();
    expect(screen.queryByText('chatExperience')).toBeNull();
  });

  it('reports total, overridden and shown counts', async () => {
    renderPanel();
    await openPanel();
    expect(screen.getByText('5 features · 0 overridden · 5 shown')).toBeDefined();

    await expandRow('chatExperience');
    await userEvent.click(screen.getByRole('button', { name: 'emma-chat' }));
    expect(screen.getByText('5 features · 1 overridden · 5 shown')).toBeDefined();

    await userEvent.type(filterInput(), 'beta');
    expect(screen.getByText('5 features · 1 overridden · 1 shown')).toBeDefined();
  });

  it('mounts no override controls while rows are collapsed', async () => {
    const { featureSet: stressSet, dial } = buildStressFeatures(30);
    const { UnflagProvider: StressProvider, useUnflag: useStressUnflag } = createUnflagReact(stressSet);
    render(
      <StressProvider inputs={{ dial }} enableOverrides storageKey="unflag.stress">
        <UnflagDevPanel useUnflag={useStressUnflag} />
      </StressProvider>,
    );
    await openPanel();

    // 30 rows are listed, but nothing interactive beyond the row buttons is mounted:
    // no JSON textareas, no boolean toggles, no enum chips.
    expect(screen.getByText('stress2')).toBeDefined();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'alpha' })).toHaveLength(0);

    await expandRow('stress2');

    expect(screen.queryAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'override stress2' })).toBeDefined();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('expands one row at a time and marks expansion state on the row button', async () => {
    renderPanel();
    await openPanel();
    expect(rowButton('chatExperience').getAttribute('aria-expanded')).toBe('false');

    await expandRow('chatExperience');
    expect(rowButton('chatExperience').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'emma-chat' })).toBeDefined();

    await expandRow('betaBanner');
    expect(rowButton('betaBanner').getAttribute('aria-expanded')).toBe('true');
    expect(rowButton('chatExperience').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'emma-chat' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'override betaBanner' })).toBeDefined();

    await expandRow('betaBanner');
    expect(rowButton('betaBanner').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('checkbox', { name: 'override betaBanner' })).toBeNull();
  });

  it('truncates a long value preview in the collapsed row', async () => {
    const { featureSet: stressSet, dial } = buildStressFeatures(3);
    const { UnflagProvider: StressProvider, useUnflag: useStressUnflag } = createUnflagReact(stressSet);
    render(
      <StressProvider inputs={{ dial }} enableOverrides storageKey="unflag.stress">
        <UnflagDevPanel useUnflag={useStressUnflag} />
      </StressProvider>,
    );
    await openPanel();

    const preview = screen.getByText(/^\{"items":/);
    expect(preview.textContent!.length).toBeLessThanOrEqual(81);
    expect(preview.textContent!.endsWith('…')).toBe(true);
  });
});
