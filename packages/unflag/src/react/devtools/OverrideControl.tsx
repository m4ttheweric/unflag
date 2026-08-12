import React, { useState } from 'react';
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
  const json = z.toJSONSchema(schema) as JsonSchemaLike;
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
  return (
    <div>
      <textarea
        aria-label={`override ${name}`}
        style={styles.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          try {
            onApply(JSON.parse(text));
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
