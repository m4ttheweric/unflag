import noRawConfigReads from './rules/no-raw-config-reads';
import requireUnreadyForDeferredReads from './rules/require-unready-for-deferred-reads';

const plugin = {
  meta: { name: '@m4ttheweric/eslint-plugin-unflag', version: '0.1.0' },
  rules: {
    'no-raw-config-reads': noRawConfigReads,
    'require-unready-for-deferred-reads': requireUnreadyForDeferredReads,
  },
};

export default plugin;
