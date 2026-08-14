export { applyOverrides } from './core/overrides';
export { defineFeatures, deferredInput, fromFeatureSet, input, type DeferredInputTypeError } from './core/define';
export { explain } from './core/explain';
export { keyMirror } from './core/keyMirror';
export { safeStringify } from './core/safeStringify';
export {
  SCHEMAS,
  type AnyInputMarker, type DeferredInputMarker, type DeferredKeys,
  type FeatureDef, type FeatureProvenance, type FeatureSet, type FromSetInputMarker,
  type FromSetKeys, type InferState,
  type InputMarker, type InputsShape, type InputValues,
  type PlainKeys, type ProvidedKeys, type Read, type ResolveInputs, type ResolveResult,
  type SatisfiedState, type StateOf, type UnreadyDecl, type Violation, type ViolationHandler,
} from './core/types';
