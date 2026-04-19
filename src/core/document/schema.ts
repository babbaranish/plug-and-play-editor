/**
 * Schema: the static rules about which nodes can contain which. A valid
 * Doc satisfies `validateDoc`. Transforms that build nodes MUST produce
 * trees that validate — this is checked in development mode via
 * assertions, and is the correctness anchor for all higher layers
 * (transforms, OT, renderer).
 */

import type {
    BlockNode,
    Doc,
    InlineNode,
    ListItemNode,
    Node,
    NodeType,
    TableCellNode,
    TableRowNode,
    AccordionSectionNode
} from './types';
import { hasChildren } from './types';

/** Tags for grouping node kinds. */
export const BLOCK_TYPES: ReadonlySet<NodeType> = new Set([
    'paragraph', 'heading', 'blockquote', 'list', 'code-block',
    'hr', 'table', 'image', 'embed', 'page-break', 'accordion'
]);

export const INLINE_TYPES: ReadonlySet<NodeType> = new Set([
    'text', 'inline-image', 'break', 'mention', 'token'
]);

export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set([
    'doc', 'blockquote', 'list', 'list-item', 'code-block',
    'table', 'table-row', 'table-cell', 'accordion', 'accordion-section',
    'paragraph', 'heading'
]);

/** Describes legal content for each container node type. */
export interface ContentModel {
    readonly allowed: ReadonlySet<NodeType>;
    readonly minChildren?: number;
    readonly maxChildren?: number;
}

export const CONTENT_MODELS: Readonly<Record<string, ContentModel>> = Object.freeze({
    doc: { allowed: BLOCK_TYPES },
    blockquote: { allowed: BLOCK_TYPES },
    list: { allowed: new Set<NodeType>(['list-item']) },
    'list-item': { allowed: BLOCK_TYPES },
    'code-block': { allowed: new Set<NodeType>(['text']) },
    paragraph: { allowed: INLINE_TYPES },
    heading: { allowed: INLINE_TYPES },
    table: { allowed: new Set<NodeType>(['table-row']) },
    'table-row': { allowed: new Set<NodeType>(['table-cell']) },
    'table-cell': { allowed: BLOCK_TYPES },
    accordion: { allowed: new Set<NodeType>(['accordion-section']) },
    'accordion-section': { allowed: BLOCK_TYPES }
});

// ─── Validation ────────────────────────────────────────────────────

export interface SchemaError {
    readonly path: readonly number[];
    readonly nodeType: NodeType;
    readonly message: string;
}

/**
 * Recursively validate a node. Returns an array of errors; empty array
 * means the tree is valid. Callers can throw, log, or pass-through.
 *
 * Errors include a `path` identifying the offending subtree in the same
 * coordinate space as the Selection's Point.path.
 */
export function validate(node: Node, path: readonly number[] = []): SchemaError[] {
    const errors: SchemaError[] = [];

    if (!hasChildren(node)) return errors;

    const model = CONTENT_MODELS[node.type];
    if (!model) return errors; // Unknown container — no rules, nothing to validate.

    const kids = getChildren(node);
    if (model.minChildren !== undefined && kids.length < model.minChildren) {
        errors.push({ path, nodeType: node.type, message: `expected at least ${model.minChildren} children, got ${kids.length}` });
    }
    if (model.maxChildren !== undefined && kids.length > model.maxChildren) {
        errors.push({ path, nodeType: node.type, message: `expected at most ${model.maxChildren} children, got ${kids.length}` });
    }
    for (let i = 0; i < kids.length; i++) {
        const child = kids[i];
        if (!model.allowed.has(child.type)) {
            errors.push({ path: [...path, i], nodeType: child.type, message: `illegal child of ${node.type}: ${child.type}` });
        }
        errors.push(...validate(child, [...path, i]));
    }

    return errors;
}

/** Throws if the tree is invalid. Meant for tests + dev assertions. */
export function assertValid(node: Node): void {
    const errs = validate(node);
    if (errs.length === 0) return;
    const report = errs.slice(0, 5).map(e => `  [${e.path.join(',')}] ${e.nodeType}: ${e.message}`).join('\n');
    throw new Error(`document schema violation (${errs.length} total):\n${report}${errs.length > 5 ? '\n  ...' : ''}`);
}

function getChildren(node: Node): readonly Node[] {
    switch (node.type) {
        case 'doc': return node.children;
        case 'paragraph':
        case 'heading': return node.children;
        case 'blockquote': return node.children;
        case 'list': return node.children;
        case 'list-item': return node.children;
        case 'code-block': return node.children;
        case 'table': return node.children;
        case 'table-row': return node.children;
        case 'table-cell': return node.children;
        case 'accordion': return node.children;
        case 'accordion-section': return [...node.summary, ...node.children];
        default: return [];
    }
}

// ─── Structural equality ──────────────────────────────────────────

/** Deep structural equality on two nodes. Used by transform diffing. */
export function nodeEquals(a: Node, b: Node): boolean {
    if (a === b) return true;
    if (a.type !== b.type) return false;

    switch (a.type) {
        case 'text': {
            const bt = b as typeof a;
            return a.text === bt.text && marksEqual(a.marks, bt.marks);
        }
        case 'inline-image': {
            const bi = b as typeof a;
            return a.src === bi.src && a.alt === bi.alt;
        }
        case 'break': return true;
        case 'mention': {
            const bm = b as typeof a;
            return a.userId === bm.userId && a.name === bm.name;
        }
        case 'token': {
            const bk = b as typeof a;
            return a.key === bk.key && a.label === bk.label;
        }
        case 'paragraph': {
            const bp = b as typeof a;
            return a.align === bp.align && childrenEqual(a.children, bp.children);
        }
        case 'heading': {
            const bh = b as typeof a;
            return a.level === bh.level && childrenEqual(a.children, bh.children);
        }
        case 'blockquote':
        case 'list-item':
        case 'code-block':
        case 'table':
        case 'table-row':
        case 'accordion': {
            return childrenEqual((a as { children: readonly Node[] }).children,
                                 (b as { children: readonly Node[] }).children);
        }
        case 'list': {
            const bl = b as typeof a;
            return a.ordered === bl.ordered && childrenEqual(a.children, bl.children);
        }
        case 'table-cell': {
            const bc = b as typeof a;
            return a.header === bc.header && childrenEqual(a.children, bc.children);
        }
        case 'accordion-section': {
            const bs = b as typeof a;
            return childrenEqual(a.summary, bs.summary) && childrenEqual(a.children, bs.children);
        }
        case 'image': {
            const bi = b as typeof a;
            return a.src === bi.src && a.alt === bi.alt && a.width === bi.width && a.height === bi.height;
        }
        case 'embed': {
            const bi = b as typeof a;
            return a.src === bi.src && a.width === bi.width && a.height === bi.height;
        }
        case 'hr':
        case 'page-break': return true;
        case 'doc': {
            const bd = b as typeof a;
            return childrenEqual(a.children, bd.children);
        }
        default:
            return false;
    }
}

function childrenEqual(a: readonly Node[], b: readonly Node[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!nodeEquals(a[i], b[i])) return false;
    }
    return true;
}

function marksEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
    if (a.length !== b.length) return false;
    const ka = a.map(m => JSON.stringify(m)).sort();
    const kb = b.map(m => JSON.stringify(m)).sort();
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    return true;
}

// ─── Convenience predicates ───────────────────────────────────────

export function isBlock(n: Node): n is BlockNode {
    return BLOCK_TYPES.has(n.type);
}

export function isInline(n: Node): n is InlineNode {
    return INLINE_TYPES.has(n.type);
}

export function isContainer(n: Node): n is Doc | BlockNode | ListItemNode | TableRowNode | TableCellNode | AccordionSectionNode {
    return CONTAINER_TYPES.has(n.type);
}
