import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnflagContextValue } from '../createUnflagReact';
import { OverrideControl } from './OverrideControl';
import { positions, styles } from './styles';

export function UnflagDevPanel({
  useUnflag,
  position = 'bottom-right',
}: {
  useUnflag: () => UnflagContextValue<Record<string, unknown>>;
  position?: keyof typeof positions;
}) {
  const unflag = useUnflag();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

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
          {Object.keys(unflag.result.provenance).map(key => {
            const prov = unflag.result.provenance[key as never]!;
            return (
              <div key={key} style={styles.row}>
                <div style={styles.rowHead}>
                  <span style={styles.name}>{key}</span>
                  <span style={styles.value}>{JSON.stringify(prov.value)}</span>
                  {prov.overridden ? <span style={styles.badge}>overridden</span> : null}
                </div>
                {prov.overridden ? (
                  <div style={styles.small}>would be {JSON.stringify(prov.underlying)}</div>
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
                    onClick={() => setExpanded(e => (e === key ? null : key))}
                  >
                    why?
                  </button>
                </div>
                {expanded === key ? (
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
