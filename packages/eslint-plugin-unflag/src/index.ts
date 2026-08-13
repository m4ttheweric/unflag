import noRawConfigReads from './rules/no-raw-config-reads';

const plugin = {
  meta: { name: '@m4ttheweric/eslint-plugin-unflag', version: '0.1.0' },
  rules: { 'no-raw-config-reads': noRawConfigReads },
};

export default plugin;
