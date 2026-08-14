import type { CSSProperties } from 'react';

const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const bg = dark ? '#1c1c1e' : '#ffffff';
const fg = dark ? '#f2f2f2' : '#1c1c1e';
const border = dark ? '#3a3a3c' : '#d4d4d8';
const accent = '#6366f1';

export const positions = {
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
} as const satisfies Record<string, CSSProperties>;

export type PanelPosition = keyof typeof positions;

export const styles = {
  trigger: {
    position: 'fixed', zIndex: 99999, padding: '6px 12px', borderRadius: 999,
    background: accent, color: '#fff', border: 'none', cursor: 'pointer',
    font: '600 12px system-ui, sans-serif',
  },
  panel: {
    position: 'fixed', zIndex: 99999, width: 380, maxHeight: '70vh', overflowY: 'auto',
    background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0,0,0,.25)', font: '13px system-ui, sans-serif', padding: 12,
  },
  // Sticky so the filter and counts stay reachable while scrolling a long list.
  // The negative offsets cancel the panel's own 12px padding so nothing peeks out above.
  header: {
    position: 'sticky', top: -12, background: bg, zIndex: 1,
    margin: '-12px -12px 0', padding: '12px 12px 8px',
    borderBottom: `1px solid ${border}`,
  },
  filter: {
    width: '100%', boxSizing: 'border-box' as const, padding: '4px 8px',
    background: 'transparent', color: fg, border: `1px solid ${border}`,
    borderRadius: 6, font: '12px system-ui, sans-serif',
  },
  counts: { fontSize: 11, opacity: 0.75, marginTop: 6 },
  // Same visual family as `counts`: a small, low-emphasis label, but bolded and
  // separated from the previous section so a nested panel's parent/child sections
  // stay visually distinct without competing with the row content below them.
  sectionHeader: {
    fontSize: 11, opacity: 0.75, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: 0.4, marginTop: 10, marginBottom: 2,
  },
  row: { borderBottom: `1px solid ${border}` },
  rowHead: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    background: 'none', border: 'none', color: fg, cursor: 'pointer',
    padding: '8px 0', textAlign: 'left' as const, font: 'inherit',
  },
  chevron: { opacity: 0.5, fontSize: 10, width: 8, flexShrink: 0 },
  name: { fontWeight: 600, flexShrink: 0 },
  value: {
    fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.8,
    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  detail: { padding: '0 0 8px 16px' },
  empty: { fontSize: 12, opacity: 0.6, padding: '12px 0' },
  badge: {
    background: accent, color: '#fff', borderRadius: 4, padding: '1px 6px',
    fontSize: 10, textTransform: 'uppercase' as const,
  },
  // Distinct (amber) from `badge`'s accent color so an unready fallback reads as a
  // waiting state, not as an override -- the two can appear side by side on one row.
  badgeUnready: {
    background: '#d97706', color: '#fff', borderRadius: 4, padding: '1px 6px',
    fontSize: 10, textTransform: 'uppercase' as const,
  },
  small: { fontSize: 11, opacity: 0.75 },
  controls: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 6 },
  chip: (active: boolean) => ({
    padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? accent : border}`,
    background: active ? accent : 'transparent', color: active ? '#fff' : fg, fontSize: 12,
  }),
  textarea: {
    width: '100%', minHeight: 60, fontFamily: 'ui-monospace, monospace', fontSize: 12,
    background: 'transparent', color: fg, border: `1px solid ${border}`, borderRadius: 6, marginTop: 6,
  },
  footer: { display: 'flex', justifyContent: 'space-between', marginTop: 10 },
  linkBtn: {
    background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 12, padding: 0,
  },
} satisfies Record<string, CSSProperties | ((active: boolean) => CSSProperties)>;
