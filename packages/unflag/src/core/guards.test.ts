import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { defineFeatures, input } from '../index';

const badOutput = () =>
  defineFeatures({
    inputs: { flags: input<{ a: boolean }>() },
    features: {
      broken: {
        reads: { flags: ['a'] },
        output: z.enum(['on', 'off']),
        resolve: () => 'sideways' as unknown as 'on',
      },
    },
  });

const throwing = () =>
  defineFeatures({
    inputs: { flags: input<{ a: boolean }>() },
    features: {
      boom: {
        reads: { flags: ['a'] },
        output: z.boolean(),
        resolve: () => {
          throw new Error('kapow');
        },
      },
    },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('guards', () => {
  it('throws on schema-mismatched output in non-prod', () => {
    expect(() => badOutput().resolve({ flags: { a: true } })).toThrowError(
      /\[unflag\] feature "broken" resolved a value that does not match its output schema/,
    );
  });

  it('skips output validation in prod', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = badOutput().resolve({ flags: { a: true } });
    expect(result.state.broken).toBe('sideways');
  });

  it('wraps resolver throws with the feature key and cause', () => {
    try {
      throwing().resolve({ flags: { a: true } });
      expect.unreachable();
    } catch (e) {
      const err = e as Error;
      expect(err.message).toBe('[unflag] feature "boom" resolver threw: kapow');
      expect((err.cause as Error).message).toBe('kapow');
    }
  });
});
