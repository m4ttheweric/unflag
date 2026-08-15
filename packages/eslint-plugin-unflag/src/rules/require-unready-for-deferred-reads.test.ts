import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './require-unready-for-deferred-reads';

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

describe('require-unready-for-deferred-reads', () => {
  it('requires an unready fallback on features that read a deferred input', () => {
    tester.run('require-unready-for-deferred-reads', rule, {
      valid: [
        // deferred-reading feature WITH a static `unready` fallback
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'off']),
      unready: 'off',
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
        },
        // deferred-reading feature WITH a resolver-form `unready`, mixed deferred + plain reads
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    chatMode: {
      reads: { flags: ['chat'], strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'off']),
      unready: ({ flags }) => (flags.chat ? 'lite' : 'off'),
      resolve: ({ flags, strategy }) => (!flags.chat || !strategy ? 'off' : strategy.mode),
    },
  },
});`,
        },
        // plain-only feature without unready, in a set that HAS a deferred input elsewhere --
        // the false positive the type-level spike died on; load-bearing.
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    attachments: {
      reads: { flags: ['killSwitch'] },
      output: z.boolean(),
      resolve: ({ flags }) => !flags.killSwitch,
    },
  },
});`,
        },
        // feature with `unready` whose reads mix a deferred key with a plain one (static form)
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    banner: {
      reads: { flags: ['chat'], strategy: ['banner'] },
      output: z.string().nullable(),
      unready: null,
      resolve: ({ flags, strategy }) => (flags.chat ? (strategy ? strategy.banner : null) : null),
    },
  },
});`,
        },
        // inputs is a variable, not an object literal -- can't know what's deferred, so bail
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

const sharedInputs = { flags: input(), strategy: deferredInput() };

defineFeatures({
  inputs: sharedInputs,
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.string(),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
        },
        // defineFeatures imported from somewhere other than unflag -- not our defineFeatures
        {
          code: `import { defineFeatures, deferredInput, input } from './local-feature-shim';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.string(),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
        },
        // dead-config (unready on an all-plain-reads feature) suppressed when inputs has a spread --
        // an unseen spread key could be deferred, so it can't be called dead.
        {
          code: `import { defineFeatures, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';
import { sharedInputs } from './shared';

defineFeatures({
  inputs: { ...sharedInputs, flags: input() },
  features: {
    attachments: {
      reads: { flags: ['killSwitch'] },
      output: z.boolean(),
      unready: false,
      resolve: ({ flags }) => !flags.killSwitch,
    },
  },
});`,
        },
        // shadowed `defineFeatures` (function parameter) is not OUR defineFeatures --
        // resolved by lexical scope, not by name, so this violating-looking body is never analyzed
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

function setup(defineFeatures) {
  return defineFeatures({
    inputs: { flags: input(), strategy: deferredInput() },
    features: {
      chatMode: {
        reads: { strategy: ['mode'] },
        output: z.string(),
        resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
      },
    },
  });
}`,
        },
        // shadowed `defineFeatures` (local declaration) -- same as above, different shadowing form
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

function setup() {
  const defineFeatures = (cfg) => cfg;
  return defineFeatures({
    inputs: { flags: input(), strategy: deferredInput() },
    features: {
      chatMode: {
        reads: { strategy: ['mode'] },
        output: z.string(),
        resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
      },
    },
  });
}`,
        },
        // shadowed `deferredInput` (function parameter): `defineFeatures` is genuine and analyzed,
        // but the shadowed `deferredInput()` call doesn't count toward the deferred set, so its
        // reader isn't flagged
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

function setup(deferredInput) {
  return defineFeatures({
    inputs: { flags: input(), strategy: deferredInput() },
    features: {
      chatMode: {
        reads: { strategy: ['mode'] },
        output: z.string(),
        resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
      },
    },
  });
}`,
        },
        // feature-level spread: a visible deferred read but no visible `unready` -- the spread
        // could carry `unready` invisibly, so the whole feature is skipped, not flagged
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';
import { baseFeature } from './shared';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    chatMode: {
      ...baseFeature,
      reads: { strategy: ['mode'] },
      output: z.string(),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
        },
        // feature-level spread: visible `unready` over plain reads -- the spread could carry a
        // deferred `reads` entry invisibly, so the whole feature is skipped, not flagged dead
        {
          code: `import { defineFeatures, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';
import { baseFeature } from './shared';

defineFeatures({
  inputs: { flags: input() },
  features: {
    attachments: {
      ...baseFeature,
      reads: { flags: ['killSwitch'] },
      output: z.boolean(),
      unready: false,
      resolve: ({ flags }) => !flags.killSwitch,
    },
  },
});`,
        },
      ],
      invalid: [
        // the UNFLAG-7 repro: reads a deferred input, no `unready` declared
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.enum(['full', 'lite', 'off']),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
          errors: [
            {
              messageId: 'missingUnready',
              data: { feature: 'chatMode', inputs: 'strategy' },
              type: 'Identifier',
            },
          ],
        },
        // two deferred inputs both read and missing -- message lists both
        {
          code: `import { defineFeatures, deferredInput } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { strategy: deferredInput(), locale: deferredInput() },
  features: {
    greeting: {
      reads: { strategy: ['mode'], locale: ['region'] },
      output: z.string(),
      resolve: ({ strategy, locale }) => (strategy ? strategy.mode : '') + (locale ? locale.region : ''),
    },
  },
});`,
          errors: [
            {
              messageId: 'missingUnready',
              data: { feature: 'greeting', inputs: 'strategy, locale' },
              type: 'Identifier',
            },
          ],
        },
        // unready on a plain-reads-only feature -- dead config
        {
          code: `import { defineFeatures, deferredInput, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

defineFeatures({
  inputs: { flags: input(), strategy: deferredInput() },
  features: {
    attachments: {
      reads: { flags: ['killSwitch'] },
      output: z.boolean(),
      unready: false,
      resolve: ({ flags }) => !flags.killSwitch,
    },
  },
});`,
          errors: [
            {
              messageId: 'deadUnready',
              data: { feature: 'attachments' },
              type: 'Identifier',
            },
          ],
        },
        // a spread in inputs does NOT suppress missingUnready for a key that's visibly deferred
        {
          code: `import { defineFeatures, deferredInput } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';
import { sharedInputs } from './shared';

defineFeatures({
  inputs: { ...sharedInputs, strategy: deferredInput() },
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.string(),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
          errors: [
            {
              messageId: 'missingUnready',
              data: { feature: 'chatMode', inputs: 'strategy' },
              type: 'Identifier',
            },
          ],
        },
        // aliased imports (`defineFeatures as df`, `deferredInput as di`) are still detected
        {
          code: `import { defineFeatures as df, deferredInput as di, input } from '@m4ttheweric/unflag';
import { z } from 'zod/v4';

df({
  inputs: { flags: input(), strategy: di() },
  features: {
    chatMode: {
      reads: { strategy: ['mode'] },
      output: z.string(),
      resolve: ({ strategy }) => (strategy ? strategy.mode : 'off'),
    },
  },
});`,
          errors: [
            {
              messageId: 'missingUnready',
              data: { feature: 'chatMode', inputs: 'strategy' },
              type: 'Identifier',
            },
          ],
        },
      ],
    });
  });
});
