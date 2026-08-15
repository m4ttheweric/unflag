import type { Rule, Scope } from 'eslint';

const IMPORT_SOURCE = '@m4ttheweric/unflag';
const DEFINE_FEATURES = 'defineFeatures';
const DEFERRED_INPUT = 'deferredInput';

type ObjectExpr = Extract<Rule.Node, { type: 'ObjectExpression' }>;
type PropertyNode = Extract<Rule.Node, { type: 'Property' }>;
type CallExpr = Extract<Rule.Node, { type: 'CallExpression' }>;
type IdentifierNode = Extract<Rule.Node, { type: 'Identifier' }>;

/**
 * A non-computed property's static key name: an Identifier's `name`, or a
 * string Literal's `value`. Null for computed keys (and, transitively,
 * spreads) -- every caller treats null as "not a match", never as a wildcard.
 */
function staticKeyName(prop: PropertyNode): string | null {
  if (prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value;
  return null;
}

/** The first non-computed property named `name` directly on an ObjectExpression. */
function findProperty(obj: ObjectExpr, name: string): PropertyNode | undefined {
  for (const p of obj.properties) {
    if (p.type === 'Property' && staticKeyName(p as PropertyNode) === name) {
      return p as PropertyNode;
    }
  }
  return undefined;
}

/** Every non-computed, statically-named key directly on an ObjectExpression. */
function objectKeys(obj: ObjectExpr): string[] {
  const keys: string[] = [];
  for (const p of obj.properties) {
    if (p.type !== 'Property') continue;
    const key = staticKeyName(p as PropertyNode);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/** Whether an ObjectExpression's own properties include a SpreadElement. */
function hasSpread(obj: ObjectExpr): boolean {
  return obj.properties.some(p => p.type === 'SpreadElement');
}

/**
 * The imported name a call's callee identifier resolves to, via ESLint's
 * lexical scope analysis -- not name-matching against `tracked`. `tracked`
 * maps each ImportSpecifier node (imported from IMPORT_SOURCE) to its
 * imported name; a reference only counts when its resolved variable's
 * definition IS one of those specifier nodes. A shadowing parameter, local
 * `const`, etc. resolves to a *different* variable (a non-import
 * definition), so it correctly falls through to `undefined` rather than a
 * false match -- the false positive CodeRabbit caught on the file-wide
 * name map this replaces.
 */
function resolveCalleeImport(
  call: CallExpr,
  sourceCode: Rule.RuleContext['sourceCode'],
  tracked: Map<object, string>,
): string | undefined {
  if (call.callee.type !== 'Identifier') return undefined;
  const identifier = call.callee as IdentifierNode;

  let scope: Scope.Scope | null = sourceCode.getScope(identifier);
  while (scope) {
    const ref = scope.references.find(r => r.identifier === identifier);
    if (ref) {
      const variable = ref.resolved;
      if (!variable) return undefined;
      for (const def of variable.defs) {
        if (def.type === 'ImportBinding' && tracked.has(def.node)) return tracked.get(def.node);
      }
      return undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A defineFeatures feature that reads a deferredInput input must declare an unready fallback',
    },
    schema: [],
    messages: {
      missingUnready:
        'feature "{{feature}}" reads deferred input(s) {{inputs}}; declare an \'unready\' fallback: a static value or a resolver over the non-deferred reads',
      deadUnready:
        'feature "{{feature}}" declares \'unready\' but reads no deferred inputs; remove it or add a deferred read',
    },
  },
  create(context) {
    // ImportSpecifier node -> imported name, for specifiers imported from
    // IMPORT_SOURCE. The source string is matched exactly (same convention
    // no-raw-config-reads documents: no alias/deep-path resolution). Keyed
    // by the specifier node itself (not its local name) so resolution can
    // go through scope analysis: a renamed local binding -- `defineFeatures
    // as df` -- still resolves, but a *shadowing* parameter or local
    // declaration with the same name does not, because it resolves to a
    // different variable entirely.
    const trackedImports = new Map<object, string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== IMPORT_SOURCE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            trackedImports.set(specifier, specifier.imported.name);
          }
        }
      },

      CallExpression(node) {
        if (resolveCalleeImport(node, context.sourceCode, trackedImports) !== DEFINE_FEATURES) return;

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ObjectExpression') return;
        const config = arg as ObjectExpr;

        const inputsProp = findProperty(config, 'inputs');
        if (!inputsProp || inputsProp.value.type !== 'ObjectExpression') return;
        const inputsObj = inputsProp.value as ObjectExpr;

        const spread = hasSpread(inputsObj);
        const deferred = new Set<string>();
        for (const p of inputsObj.properties) {
          if (p.type !== 'Property') continue;
          const key = staticKeyName(p as PropertyNode);
          if (!key) continue;
          const value = (p as PropertyNode).value;
          if (
            value.type === 'CallExpression' &&
            resolveCalleeImport(value as CallExpr, context.sourceCode, trackedImports) === DEFERRED_INPUT
          ) {
            deferred.add(key);
          }
        }

        const featuresProp = findProperty(config, 'features');
        if (!featuresProp || featuresProp.value.type !== 'ObjectExpression') return;
        const featuresObj = featuresProp.value as ObjectExpr;

        for (const p of featuresObj.properties) {
          if (p.type !== 'Property') continue;
          const featureProp = p as PropertyNode;
          const featureName = staticKeyName(featureProp);
          if (!featureName || featureProp.value.type !== 'ObjectExpression') continue;
          const featureObj = featureProp.value as ObjectExpr;

          // A spread on the feature object itself can carry `unready` or
          // `reads` invisibly (`{ ...base, resolve }`), so neither
          // diagnostic is provable -- skip the whole feature, same as a
          // non-literal one. Distinct from `spread` above (inputs-level),
          // which only ever suppresses deadUnready.
          if (hasSpread(featureObj)) continue;

          const readsProp = findProperty(featureObj, 'reads');
          if (!readsProp || readsProp.value.type !== 'ObjectExpression') continue;
          const reads = objectKeys(readsProp.value as ObjectExpr);

          const unreadyProp = findProperty(featureObj, 'unready');
          const readDeferred = reads.filter(r => deferred.has(r));

          if (readDeferred.length > 0 && !unreadyProp) {
            context.report({
              node: featureProp.key,
              messageId: 'missingUnready',
              data: { feature: featureName, inputs: readDeferred.join(', ') },
            });
          } else if (readDeferred.length === 0 && unreadyProp && !spread) {
            context.report({
              node: unreadyProp.key,
              messageId: 'deadUnready',
              data: { feature: featureName },
            });
          }
        }
      },
    };
  },
};

export default rule;
