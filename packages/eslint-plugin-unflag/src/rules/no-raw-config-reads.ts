import type { Rule } from 'eslint';
import picomatch from 'picomatch';

type Options = {
  restricted: Array<{ importSource: string } | { objectPattern: string }>;
  allowIn?: string[];
};

const DEFAULT_ALLOW_IN = ['**/*.features.ts', '**/features/**'];

/**
 * Returns `filename` relative to `cwd`, normalizing separators and a
 * trailing slash on `cwd` first so a root-ish cwd (e.g. '/repo/' or '/')
 * doesn't get double-counted when slicing off the prefix (that produced
 * off-by-one results like 'oo.ts' instead of 'foo.ts'). Falls back to the
 * (normalized) absolute filename when it doesn't share the cwd prefix,
 * including when the shared prefix is only a sibling-directory name
 * collision (e.g. cwd '/repo' vs file under '/repository/...').
 */
export function relativeTo(cwd: string, filename: string): string {
  const file = filename.replace(/\\/g, '/');
  let base = cwd.replace(/\\/g, '/');
  if (base.length > 1 && base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  if (file === base) return '';
  const prefix = base === '/' ? base : `${base}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

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
          restricted: {
            type: 'array',
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: { importSource: { type: 'string' } },
                  required: ['importSource'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: { objectPattern: { type: 'string' } },
                  required: ['objectPattern'],
                  additionalProperties: false,
                },
              ],
            },
          },
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
    // like '**/features/**' (or 'src/features/**' without a leading '**/')
    // behave regardless of how eslint was invoked.
    const rel = relativeTo(context.cwd, filename);
    if (isAllowed(rel) || isAllowed(filename)) return {};

    // The schema restricts each `restricted` entry to one of the two known
    // shapes, but guard defensively at runtime too in case schema
    // validation is ever bypassed (e.g. a caller constructs the rule
    // options programmatically rather than through eslint's config loader).
    const isRestrictedEntry = (r: unknown): r is Record<string, unknown> =>
      typeof r === 'object' && r !== null;
    const importSources = new Set(
      opts.restricted.flatMap(r =>
        isRestrictedEntry(r) && 'importSource' in r ? [r.importSource as string] : [],
      ),
    );
    const objectPatterns = opts.restricted.flatMap(r =>
      isRestrictedEntry(r) && 'objectPattern' in r ? [r.objectPattern as string] : [],
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
