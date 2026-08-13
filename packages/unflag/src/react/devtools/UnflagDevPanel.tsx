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
  // Accordion: at most one row is expanded, so at most one OverrideControl (and its
  // textarea/chips) is mounted no matter how many features the set has.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [explainFor, setExplainFor] = useState<string | null>(null);

  const provenance = unflag.result.provenance as Record<
    string,
    { value: unknown; underlying?: unknown; overridden?: boolean }
  >;

  const keys = useMemo(() => Object.keys(provenance), [provenance]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? keys.filter(key => key.toLowerCase().includes(needle)) : keys;
  }, [keys, filter]);
  const overriddenCount = useMemo(
    () => keys.reduce((n, key) => (provenance[key]!.overridden ? n + 1 : n), 0),
    [keys, provenance],
  );
  // Stringifying every value is the one per-row cost that scales with payload size
  // rather than row count, so it is keyed to `provenance` (which only changes when a
  // value actually changes) instead of re-running on every filter keystroke or expand.
  const previews = useMemo(
    () => Object.fromEntries(keys.map(key => [key, previewValue(provenance[key]!.value)])),
    [keys, provenance],
  );

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
              {keys.length} features · {overriddenCount} overridden · {visible.length} shown
            </div>
          </div>
          {visible.length === 0 ? <div style={styles.empty}>no features match</div> : null}
          {visible.map(key => {
            const prov = provenance[key]!;
            const isExpanded = expandedRow === key;
            return (
              <div key={key} style={styles.row}>
                <button
                  type="button"
                  style={styles.rowHead}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedRow(current => (current === key ? null : key))}
                >
                  {/* Decorative: kept out of the row's accessible name, which is
                      the feature name plus its value preview. */}
                  <span aria-hidden="true" style={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
                  <span style={styles.name}>{key}</span>
                  <span style={styles.value}>{previews[key]}</span>
                  {prov.overridden ? <span style={styles.badge}>overridden</span> : null}
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
                        onClick={() => setExplainFor(e => (e === key ? null : key))}
                      >
                        why?
                      </button>
                    </div>
                    {explainFor === key ? (
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
