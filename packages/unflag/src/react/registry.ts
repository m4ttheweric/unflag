import type { Context } from 'react';

/**
 * Maps a feature set object to the React context created for it by createUnflagReact,
 * so a child provider can locate its fromFeatureSet parents. WeakMap: sets are
 * module-level singletons; no lifecycle management needed.
 */
const registry = new WeakMap<object, Context<unknown>>();

export const registerSetContext = (set: object, ctx: Context<unknown>): void => {
  registry.set(set, ctx);
};
export const getSetContext = (set: object): Context<unknown> | undefined => registry.get(set);
