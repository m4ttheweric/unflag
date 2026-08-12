import { describe, expect, it } from 'vitest';
import { UNFLAG_VERSION } from './index';

describe('workspace smoke', () => {
  it('imports the package entry', () => {
    expect(UNFLAG_VERSION).toBe('0.0.0');
  });
});
