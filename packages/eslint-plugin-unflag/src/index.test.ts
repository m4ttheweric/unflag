import { describe, expect, it } from 'vitest';
import plugin from './index';

describe('eslint-plugin-unflag', () => {
  it('exports a plugin with the no-raw-config-reads rule', () => {
    expect(plugin.meta.name).toBe('@m4ttheweric/eslint-plugin-unflag');
    expect(plugin.rules).toBeDefined();
    expect(Object.keys(plugin.rules)).toEqual(['no-raw-config-reads']);
  });
});
