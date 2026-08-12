import noRawConfigReads from './rules/no-raw-config-reads';

const plugin = {
  meta: { name: 'eslint-plugin-unflag', version: '0.0.0' },
  rules: { 'no-raw-config-reads': noRawConfigReads },
};

export default plugin;
