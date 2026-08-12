import type { Rule } from 'eslint';
import picomatch from 'picomatch';

type Options = {
  restricted: Array<{ importSource: string } | { objectPattern: string }>;
  allowIn?: string[];
};

const DEFAULT_ALLOW_IN = ['**/*.features.ts', '**/features/**'];

function memberChain(node: Rule.Node): string | null {
  // Builds "a.b.c" for non-computed identifier chains; null for anything else.
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const objectChain = memberChain(node.object as Rule.Node);
    return objectChain ? `${objectChain}.${node.property.name}` : null;
  }
  return null;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Raw feature-flag / config reads are only allowed inside feature-resolution modules',
    },
    schema: [
      {
        type: 'object',
        properties: {
          restricted: { type: 'array' },
          allowIn: { type: 'array', items: { type: 'string' } },
        },
        required: ['restricted'],
        additionalProperties: false,
      },
    ],
    messages: {
      rawImport:
        'Importing "{{source}}" is only allowed in feature-resolution modules (allowIn globs).',
      rawMemberAccess:
        'Reading "{{pattern}}" directly is only allowed in feature-resolution modules (allowIn globs).',
    },
  },
  create(context) {
    const opts = (context.options[0] ?? { restricted: [] }) as Options;
    const allowIn = opts.allowIn ?? DEFAULT_ALLOW_IN;
    const filename = context.filename.replace(/\\/g, '/');
    const isAllowed = picomatch(allowIn, { dot: true });
    // Match against the path relative to cwd AND the absolute path, so globs
    // like '**/features/**' behave regardless of how eslint was invoked.
    const rel = filename.startsWith(context.cwd.replace(/\\/g, '/'))
      ? filename.slice(context.cwd.length + 1)
      : filename;
    if (isAllowed(rel) || isAllowed(filename)) return {};

    const importSources = new Set(
      opts.restricted.flatMap(r => ('importSource' in r ? [r.importSource] : [])),
    );
    const objectPatterns = opts.restricted.flatMap(r =>
      'objectPattern' in r ? [r.objectPattern] : [],
    );

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source === 'string' && importSources.has(source)) {
          context.report({ node, messageId: 'rawImport', data: { source } });
        }
      },
      MemberExpression(node) {
        const chain = memberChain(node as Rule.Node);
        if (chain && objectPatterns.includes(chain)) {
          context.report({ node, messageId: 'rawMemberAccess', data: { pattern: chain } });
        }
      },
    };
  },
};

export default rule;
