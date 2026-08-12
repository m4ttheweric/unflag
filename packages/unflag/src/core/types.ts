import type { z } from 'zod/v4';

export type InputMarker<T> = { readonly __unflag: 'input'; readonly __t?: T };
export type InputsShape = Record<string, InputMarker<unknown>>;

export type InputValues<I extends InputsShape> = {
  [K in keyof I]: I[K] extends InputMarker<infer T> ? T : never;
};

export type ReadsFor<I extends InputsShape> = {
  [K in keyof I]?: readonly Extract<keyof InputValues<I>[K], string>[];
};

export type FeatureDef<I extends InputsShape, Out extends z.ZodType> = {
  reads: ReadsFor<I>;
  output: Out;
  resolve: (inputs: InputValues<I>) => z.output<Out>;
};

export type Read = { input: string; key: string; value: unknown };
export type Violation = { feature: string; input: string; key: string };
export type ViolationHandler = (violation: Violation) => void;

export type FeatureProvenance = {
  value: unknown;
  declaredReads: Record<string, readonly string[]>;
  actualReads: Read[];
  overridden: boolean;
  underlying?: unknown;
  staleOverrideDiscarded?: { attempted: unknown; reason: string };
};

export type ResolveResult<S> = {
  state: S;
  provenance: Record<Extract<keyof S, string>, FeatureProvenance>;
  discardedOverrides?: Record<string, { attempted: unknown; reason: string }>;
};

export type StateOf<F> = {
  -readonly [K in keyof F]: F[K] extends { output: infer O extends z.ZodType } ? z.output<O> : never;
};

export type ResolveOptions = { onViolation?: ViolationHandler };

export type FeatureSet<I extends InputsShape, F> = {
  resolve(inputs: InputValues<I>, opts?: ResolveOptions): ResolveResult<StateOf<F>>;
  graph(): Record<Extract<keyof F, string>, Record<string, readonly string[]>>;
  builder(baseline: InputValues<I>): (overrides?: Partial<StateOf<F>>) => StateOf<F>;
  schemas: { [K in keyof F]: z.ZodType };
};

export type InferState<FS> = FS extends FeatureSet<InputsShape, infer F> ? StateOf<F> : never;

export const SCHEMAS: unique symbol = Symbol.for('unflag.schemas');

export const isProd = (): boolean =>
  typeof globalThis !== 'undefined' &&
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
    'production';
