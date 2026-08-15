import type { Rule } from 'eslint';

const IMPORT_SOURCE = '@m4ttheweric/unflag';
const DEFINE_FEATURES = 'defineFeatures';
const DEFERRED_INPUT = 'deferredInput';

type ObjectExpr = Extract<Rule.Node, { type: 'ObjectExpression' }>;
type PropertyNode = Extract<Rule.Node, { type: 'Property' }>;
type CallExpr = Extract<Rule.Node, { type: 'CallExpression' }>;

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

/** The imported name a call's callee resolves to via `importedNames`, if any. */
function calleeImportedName(call: CallExpr, importedNames: Map<string, string>): string | undefined {
  return call.callee.type === 'Identifier' ? importedNames.get(call.callee.name) : undefined;
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
    // Local binding name -> imported name, for specifiers imported from
    // IMPORT_SOURCE. The source string is matched exactly (same convention
    // no-raw-config-reads documents: no alias/deep-path resolution), but a
    // renamed local binding -- `defineFeatures as df` -- still resolves,
    // because it's the *imported* name we key detection on, not the local one.
    const importedNames = new Map<string, string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== IMPORT_SOURCE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            importedNames.set(specifier.local.name, specifier.imported.name);
          }
        }
      },

      CallExpression(node) {
        if (calleeImportedName(node, importedNames) !== DEFINE_FEATURES) return;

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
            calleeImportedName(value as CallExpr, importedNames) === DEFERRED_INPUT
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
