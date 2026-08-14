import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { safeStringify } from '../../core/safeStringify';
import type { UnflagContextValue } from '../createUnflagReact';
import { OverrideControl } from './OverrideControl';
import { positions, styles, type PanelPosition } from './styles';

const PREVIEW_MAX = 80;

/**
 * One-line value preview for a collapsed row. Long payloads (a 500-item array from a
 * heavy object feature, say) would otherwise blow the row height out, so the string is
 * hard-capped and marked with a trailing ellipsis. `safeStringify` returns `String(value)`
 * for undefined/function/BigInt values (which `JSON.stringify` can't handle, and throws on
 * for BigInt) instead of throwing and blanking the whole panel.
 */
function previewValue(value: unknown): string {
  const text = safeStringify(value);
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}

type RowProvenance = {
  value: unknown;
  underlying?: unknown;
  overridden?: boolean;
  unreadyFallback?: boolean;
};

/**
 * One set's rows: either the panel's own set (`label: null`) or one ancestor set from
 * `unflag.parents` (`label` is that ancestor's chain label, e.g. "app"). Expand/explain
 * state lives in the panel (so only one row across every section is ever expanded at
 * once, preserving the accordion), but is keyed by `${label ?? 'self'}:${featureKey}`
 * here so a same-named feature in a parent and child set never collides. Overrides,
 * `explain`, and schemas all come from THIS section's own `unflag`, so acting on a
 * parent row (override, why?) reaches back into the parent provider, not the child's.
 */
function SetSection({
  label,
  unflag,
  filter,
  expandedRow,
  setExpandedRow,
  explainFor,
  setExplainFor,
}: {
  label: string | null;
  unflag: UnflagContextValue<Record<string, unknown>>;
  filter: string;
  expandedRow: string | null;
  setExpandedRow: React.Dispatch<React.SetStateAction<string | null>>;
  explainFor: string | null;
  setExplainFor: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const sectionKey = label ?? 'self';
  const provenance = unflag.result.provenance as Record<string, RowProvenance>;

  const keys = useMemo(() => Object.keys(provenance), [provenance]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? keys.filter(key => key.toLowerCase().includes(needle)) : keys;
  }, [keys, filter]);
  // Stringifying every value is the one per-row cost that scales with payload size
  // rather than row count, so it is keyed to `provenance` (which only changes when a
  // value actually changes) instead of re-running on every filter keystroke or expand.
  const previews = useMemo(
    () => Object.fromEntries(keys.map(key => [key, previewValue(provenance[key]!.value)])),
    [keys, provenance],
  );

  return (
    <>
      {label !== null ? <div style={styles.sectionHeader}>{label}</div> : null}
      {visible.map(key => {
        const prov = provenance[key]!;
        const rowKey = `${sectionKey}:${key}`;
        const isExpanded = expandedRow === rowKey;
        return (
          <div key={rowKey} style={styles.row}>
            <button
              type="button"
              style={styles.rowHead}
              aria-expanded={isExpanded}
              onClick={() => setExpandedRow(current => (current === rowKey ? null : rowKey))}
            >
              {/* Decorative: kept out of the row's accessible name, which is
                  the feature name plus its value preview. */}
              <span aria-hidden="true" style={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
              <span style={styles.name}>{key}</span>
              <span style={styles.value}>{previews[key]}</span>
              {prov.overridden ? <span style={styles.badge}>overridden</span> : null}
              {prov.unreadyFallback ? <span style={styles.badgeUnready}>unready</span> : null}
            </button>
            {isExpanded ? (
              <div style={styles.detail}>
                {prov.overridden ? (
                  <div style={styles.small}>would be {safeStringify(prov.underlying)}</div>
                ) : null}
                <OverrideControl
                  name={key}
                  schema={unflag.schemas[key]!}
                  value={prov.value}
                  onApply={v => unflag.setOverride(key, v)}
                />
                <div style={styles.controls}>
                  {prov.overridden ? (
                    <button type="button" style={styles.linkBtn} onClick={() => unflag.clearOverride(key)}>
                      reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={styles.linkBtn}
                    aria-label={`why ${key}`}
                    onClick={() => setExplainFor(e => (e === rowKey ? null : rowKey))}
                  >
                    why?
                  </button>
                </div>
                {explainFor === rowKey ? (
                  <div style={{ ...styles.small, marginTop: 4 }}>
                    <span>{unflag.explain(key as never)}</span>{' '}
                    <button
                      type="button"
                      style={styles.linkBtn}
                      onClick={() => void navigator.clipboard?.writeText(unflag.explain(key as never))}
                    >
                      copy
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function UnflagDevPanel({
  useUnflag,
  position = 'bottom-right',
}: {
  useUnflag: () => UnflagContextValue<Record<string, unknown>>;
  position?: PanelPosition;
}) {
  const unflag = useUnflag();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  // Accordion: at most one row (across every section) is expanded, so at most one
  // OverrideControl (and its textarea/chips) is mounted no matter how many features
  // or nested sets the panel has.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [explainFor, setExplainFor] = useState<string | null>(null);

  // Parents first, then the panel's own set -- so a nested panel renders ancestor
  // sections above the child's own rows.
  const sections = [
    ...unflag.parents.map(p => ({ label: p.label, unflag: p.ctx })),
    { label: null as string | null, unflag },
  ];

  const needle = filter.trim().toLowerCase();
  let totalCount = 0;
  let overriddenCount = 0;
  let shownCount = 0;
  for (const { unflag: sectionUnflag } of sections) {
    const provenance = sectionUnflag.result.provenance as Record<string, RowProvenance>;
    const keys = Object.keys(provenance);
    totalCount += keys.length;
    overriddenCount += keys.filter(key => provenance[key]!.overridden).length;
    shownCount += needle ? keys.filter(key => key.toLowerCase().includes(needle)).length : keys.length;
  }

  const body = (
    <>
      <button
        type="button"
        style={{ ...styles.trigger, ...positions[position] }}
        onClick={() => setOpen(o => !o)}
      >
        unflag
      </button>
      {open ? (
        <div style={{ ...styles.panel, ...positions[position], transform: 'translateY(-40px)' }}>
          <div style={styles.header}>
            <input
              type="search"
              aria-label="filter features"
              placeholder="filter features"
              style={styles.filter}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <div style={styles.counts}>
              {totalCount} features · {overriddenCount} overridden · {shownCount} shown
            </div>
          </div>
          {shownCount === 0 ? <div style={styles.empty}>no features match</div> : null}
          {sections.map(({ label, unflag: sectionUnflag }) => (
            <SetSection
              key={label ?? '::self'}
              label={label}
              unflag={sectionUnflag}
              filter={filter}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
              explainFor={explainFor}
              setExplainFor={setExplainFor}
            />
          ))}
          <div style={styles.footer}>
            <button type="button" style={styles.linkBtn} onClick={() => unflag.clearAll()} aria-label="clear all overrides">
              clear all overrides
            </button>
            <button type="button" style={styles.linkBtn} onClick={() => setOpen(false)}>
              close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  return createPortal(body, document.body);
}
