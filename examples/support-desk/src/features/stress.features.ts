// Stress-mode fixture: synthesizes `count` features to load-test the dev panel
// (provenance table, override storage, JSON editing) at scale. Dynamic feature
// keys mean the static literal-object typing path (`defineFeatures<I, const F>`)
// can't infer `F` from a plain object built in a loop, so this file builds the
// features record programmatically and casts at the two spots where TypeScript
// needs the shape pinned down. Casts are intentionally local to this file --
// the point is runtime stress, not static inference.
import { defineFeatures, input } from 'unflag';
import { z } from 'zod/v4';

const ENUM_OPTIONS = ['alpha', 'bravo', 'charlie', 'delta', 'echo'] as const;

// Loose shape for the dynamically-built features record (the internal
// `FeatureDef`/`InputsShape` types aren't part of the public `unflag` entrypoint).
type StressFeatureDef = {
  reads: { dial: readonly [string] };
  output: z.ZodType;
  resolve: (inputs: { dial: Record<string, boolean> }) => unknown;
};

/**
 * `count` deterministic dial values, alternating true/false starting at true:
 * `{ d0: true, d1: false, d2: true, ... }`.
 */
export function buildStressDial(count: number): Record<string, boolean> {
  const dial: Record<string, boolean> = {};
  for (let i = 0; i < count; i++) {
    dial[`d${i}`] = i % 2 === 0;
  }
  return dial;
}

function buildHeavyItems(i: number, on: boolean, size: number) {
  const items: { id: number; label: string }[] = [];
  for (let j = 0; j < size; j++) {
    items.push({ id: i * 1000 + j, label: `feature${i}-item${j}-${on ? 'on' : 'off'}` });
  }
  return items;
}

/**
 * `count` synthetic features named `feature0`..`feature<count-1>`, cycling
 * kind by `i % 3`: enum, boolean, object. Every feature reads exactly one dial
 * key (`d<i>`) so provenance/violation tracking stays honest under stress.
 * Object features get a HEAVY 500-item `items` array when `i % 30 === 2`
 * (guaranteeing several heavy rows at count=300); otherwise a light 3-item array.
 */
export function buildStressFeatureSet(count: number) {
  const inputs = { dial: input<Record<string, boolean>>() };

  const features: Record<string, StressFeatureDef> = {};

  for (let i = 0; i < count; i++) {
    const kind = i % 3;
    const dialKey = `d${i}`;

    if (kind === 0) {
      features[`feature${i}`] = {
        reads: { dial: [dialKey] },
        output: z.enum(ENUM_OPTIONS),
        resolve: ({ dial }) => ENUM_OPTIONS[(i + (dial[dialKey] ? 1 : 0)) % ENUM_OPTIONS.length],
      };
    } else if (kind === 1) {
      features[`feature${i}`] = {
        reads: { dial: [dialKey] },
        output: z.boolean(),
        resolve: ({ dial }) => Boolean(dial[dialKey]) !== (i % 2 === 0),
      };
    } else {
      const heavy = i % 30 === 2;
      const size = heavy ? 500 : 3;
      features[`feature${i}`] = {
        reads: { dial: [dialKey] },
        output: z.object({
          items: z.array(z.object({ id: z.number(), label: z.string() })),
          meta: z.object({ description: z.string(), tags: z.array(z.string()) }),
        }),
        resolve: ({ dial }) => {
          const on = Boolean(dial[dialKey]);
          return {
            items: buildHeavyItems(i, on, size),
            meta: {
              description: `feature${i} object payload (${heavy ? 'heavy' : 'light'}, dial=${on})`,
              tags: [heavy ? 'heavy' : 'light', on ? 'on' : 'off', `mod${i % 30}`],
            },
          };
        },
      };
    }
  }

  return defineFeatures({
    inputs,
    features,
  } as never);
}
