import type { z } from 'zod/v4';

export type InputMarker<T> = { readonly __unflag: 'input'; readonly __t?: T };
export type DeferredInputMarker<T> = { readonly __unflag: 'deferred'; readonly __t?: T };
export type FromSetInputMarker<T> = { readonly __unflag: 'fromSet'; readonly __set: object; readonly __t?: T };
export type AnyInputMarker<T> = InputMarker<T> | DeferredInputMarker<T> | FromSetInputMarker<T>;
export type InputsShape = Record<string, AnyInputMarker<unknown>>;

export type InputValues<I extends InputsShape> = {
  [K in keyof I]: I[K] extends AnyInputMarker<infer T> ? T : never;
};

export type DeferredKeys<I extends InputsShape> = {
  [K in keyof I]: I[K] extends { readonly __unflag: 'deferred' } ? K : never;
}[keyof I];
export type FromSetKeys<I extends InputsShape> = {
  [K in keyof I]: I[K] extends { readonly __unflag: 'fromSet' } ? K : never;
}[keyof I];
export type PlainKeys<I extends InputsShape> = Exclude<keyof I, DeferredKeys<I>>;

/** resolve()'s input type: plain (and fromSet) keys required, deferred keys optional. */
export type ResolveInputs<I extends InputsShape> = { [K in PlainKeys<I>]: InputValues<I>[K] } & {
  [K in DeferredKeys<I>]?: InputValues<I>[K];
};

export type ReadsFor<I extends InputsShape> = {
  [K in keyof I]?: readonly Extract<keyof NonNullable<InputValues<I>[K]>, string>[];
};

export type UnreadyDecl<I extends InputsShape, Out extends z.ZodType> =
  | z.output<Out>
  | ((inputs: Pick<InputValues<I>, PlainKeys<I> & keyof I>) => z.output<Out>);

export type FeatureDef<I extends InputsShape, Out extends z.ZodType> = {
  reads: ReadsFor<I>;
  output: Out;
  /**
   * Required iff `reads` names a deferred input. Serves as the feature's resolved
   * value while that input is absent. Function form computes the waiting state from
   * the non-deferred inputs. NOTE: an output schema whose values are themselves
   * functions cannot use the static form (typeof-function is how the forms are told
   * apart); such outputs are outside unflag's domain.
   */
  unready?: UnreadyDecl<I, Out>;
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
  unreadyFallback?: boolean;
  awaitingInputs?: readonly string[];
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
  readonly inputs: I;
  resolve(inputs: ResolveInputs<I>, opts?: ResolveOptions): ResolveResult<StateOf<F>>;
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
