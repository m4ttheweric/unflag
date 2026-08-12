import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod/v4';
import { styles } from './styles';

type JsonSchemaLike = { type?: string; enum?: unknown[] };

export function OverrideControl({
  name, schema, value, onApply,
}: {
  name: string;
  schema: z.ZodType;
  value: unknown;
  onApply: (value: unknown) => void;
}) {
  // Some schemas (e.g. z.date()) cannot be represented as JSON Schema and throw.
  // Downstream validation still happens in applyOverrides via the original zod schema,
  // so falling back to the raw JSON editor here is safe.
  let json: JsonSchemaLike = {};
  try {
    json = z.toJSONSchema(schema) as JsonSchemaLike;
  } catch {
    json = {};
  }
  const options = json.enum;

  if (Array.isArray(options)) {
    return (
      <div style={styles.controls}>
        {options.map(opt => (
          <button
            key={String(opt)}
            type="button"
            style={styles.chip(Object.is(opt, value))}
            onClick={() => onApply(opt)}
          >
            {String(opt)}
          </button>
        ))}
      </div>
    );
  }

  if (json.type === 'boolean') {
    return (
      <div style={styles.controls}>
        <label style={styles.small}>
          <input
            type="checkbox"
            aria-label={`override ${name}`}
            checked={value === true}
            onChange={e => onApply(e.target.checked)}
          />
          {' '}enabled
        </label>
      </div>
    );
  }

  return <JsonEditor name={name} value={value} onApply={onApply} />;
}

function JsonEditor({
  name, value, onApply,
}: { name: string; value: unknown; onApply: (value: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  // Tracks the serialization of `value` as of the last resync, so the effect below can
  // tell a genuine content change (e.g. another control cleared this override) apart from
  // a same-content-but-new-reference `value` (e.g. `applyOverrides` re-running because an
  // unrelated feature's override changed, which produces a fresh object for every entry).
  // Keying the effect on `value` by reference alone would fire on the latter too, wiping
  // any in-progress unsaved edit in this textarea.
  const lastSynced = useRef(text);

  useEffect(() => {
    const incoming = JSON.stringify(value, null, 2);
    if (incoming !== lastSynced.current) {
      lastSynced.current = incoming;
      setText(incoming);
      setError(null);
    }
  }, [value]);

  return (
    <div>
      <textarea
        aria-label={`override ${name}`}
        style={styles.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text);
            // No-op guard: if the text still parses to the current value (e.g. it was
            // just resynced above and the user made no edit before blurring), don't
            // re-apply -- that would re-create an override that was just cleared.
            if (JSON.stringify(parsed) === JSON.stringify(value)) {
              setError(null);
              return;
            }
            onApply(parsed);
            setError(null);
          } catch {
            setError('invalid JSON, not applied');
          }
        }}
      />
      {error ? <div style={{ ...styles.small, color: '#ef4444' }}>{error}</div> : null}
    </div>
  );
}
