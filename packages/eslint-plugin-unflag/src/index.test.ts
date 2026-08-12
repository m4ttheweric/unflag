import { describe, expect, it } from 'vitest';
import { rules } from './index';

describe('eslint-plugin-unflag', () => {
  it('exports rules object', () => {
    expect(rules).toBeDefined();
    expect(typeof rules).toBe('object');
  });
});
