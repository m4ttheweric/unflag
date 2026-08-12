import type { CSSProperties } from 'react';

const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const bg = dark ? '#1c1c1e' : '#ffffff';
const fg = dark ? '#f2f2f2' : '#1c1c1e';
const border = dark ? '#3a3a3c' : '#d4d4d8';
const accent = '#6366f1';

export const positions: Record<string, CSSProperties> = {
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
};

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
  row: { borderBottom: `1px solid ${border}`, padding: '8px 0' },
  rowHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontWeight: 600 },
  value: { fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  badge: {
    background: accent, color: '#fff', borderRadius: 4, padding: '1px 6px',
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
