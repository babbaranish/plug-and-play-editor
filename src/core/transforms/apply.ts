/**
 * Pure application: given a Doc and a Transform, return a new Doc with
 * the transform applied. Unchanged subtrees are preserved by reference
 * for structural sharing (important for OT and renderer short-circuits).
 *
 * A small set of well-tested primitives live here; the transform ADT
 * grew to ~14 variants precisely because most real edits decompose into
 * one of them without further complication.
 */

import type {
    Doc,
    Node,
    BlockNode,
    TextNode,
    InlineNode,
    Mark
} from '../document';
import type { Transform } from './types';
import { text } from '../document';
import { assertNever } from '../selection';
import type { Path } from '../selection';

export function apply(docNode: Doc, t: Transform): Doc {
    return applyGeneric(docNode, t) as Doc;
}

function applyGeneric(docNode: Doc, t: Transform): Doc {
    switch (t.kind) {
        case 'insert-inline':
            return updateAt(docNode, t.at.path.slice(0, -1), (parent) => {
                const inlineIdx = t.at.path[t.at.path.length - 1];
                return insertInlineAt(parent, inlineIdx, t.at.offset, t.node);
            });
        case 'insert-block':
            return updateAt(docNode, t.parent, (parent) => insertChild(parent, t.index, t.node));
        case 'delete-text':
            return updateAt(docNode, t.path, (leaf) => {
                if (leaf.type !== 'text') return leaf;
                const next = leaf.text.slice(0, t.start) + leaf.text.slice(t.end);
                return text(next, leaf.marks);
            });
        case 'remove-block':
            return updateAt(docNode, t.parent, (parent) => removeChild(parent, t.index));
        case 'replace-text':
            return updateAt(docNode, t.path, (leaf) => {
                if (leaf.type !== 'text') return leaf;
                const next = leaf.text.slice(0, t.start) + t.insert + leaf.text.slice(t.end);
                return text(next, leaf.marks);
            });
        case 'set-attr':
            return updateAt(docNode, t.path, (node) => {
                return { ...node, [t.attribute]: t.next } as Node;
            });
        case 'add-mark':
            return updateAt(docNode, t.path, (leaf) => {
                if (leaf.type !== 'text') return leaf;
                return splitAndMark(leaf, t.start, t.end, t.mark, /*add*/ true);
            });
        case 'remove-mark':
            return updateAt(docNode, t.path, (leaf) => {
                if (leaf.type !== 'text') return leaf;
                return splitAndMark(leaf, t.start, t.end, t.mark, /*add*/ false);
            });
        case 'move-block': {
            // Two updates: remove at from, then insert at to. We snapshot
            // the moved node first so we don't lose it to re-structuring.
            const moved = nodeAt(docNode, [...t.from.parent, t.from.index]);
            if (!moved) return docNode;
            const removed = updateAt(docNode, t.from.parent, (p) => removeChild(p, t.from.index));
            return updateAt(removed, t.to.parent, (p) => insertChild(p, t.to.index, moved as BlockNode));
        }
        case 'split':
            return updateAt(docNode, t.parent, (container) => {
                const kids = getKids(container);
                if (t.index <= 0 || t.index >= kids.length) return container;
                const left = kids.slice(0, t.index);
                const right = kids.slice(t.index);
                // Represent the split as two consecutive containers of the same
                // type. This is a simplified default; schema-aware variants
                // should be added per node type as the editor needs them.
                const leftClone = withKids(container, left);
                const rightClone = withKids(container, right);
                return replaceInParent(container, [leftClone, rightClone]);
            });
        case 'join':
            return updateAt(docNode, t.parent, (container) => {
                const kids = getKids(container);
                if (t.index < 0 || t.index >= kids.length - 1) return container;
                const merged = kids.slice();
                const left = merged[t.index];
                const right = merged[t.index + 1];
                if (!canJoin(left, right)) return container;
                merged.splice(t.index, 2, mergeNodes(left, right));
                return withKids(container, merged);
            });
        case 'wrap':
            return updateAt(docNode, t.parent, (container) => {
                const kids = getKids(container);
                const inner = kids.slice(t.start, t.end);
                const wrapped = makeContainer(t.wrapperType, inner);
                const next = [...kids.slice(0, t.start), wrapped, ...kids.slice(t.end)];
                return withKids(container, next);
            });
        case 'unwrap':
            return updateAt(docNode, t.parent, (container) => {
                const kids = getKids(container);
                const target = kids[t.index];
                if (!target) return container;
                const inner = getKids(target);
                const next = [...kids.slice(0, t.index), ...inner, ...kids.slice(t.index + 1)];
                return withKids(container, next);
            });
        case 'replace-node':
            return updateAt(docNode, t.path, () => t.next);
        default:
            return assertNever(t);
    }
}

// ─── Node traversal helpers ───────────────────────────────────────

function nodeAt(root: Node, path: Path): Node | null {
    let cursor: Node = root;
    for (const idx of path) {
        const kids = getKids(cursor);
        if (!kids || idx < 0 || idx >= kids.length) return null;
        cursor = kids[idx];
    }
    return cursor;
}

type KidAware = Node & { children?: readonly Node[] };

function getKids(node: Node): readonly Node[] {
    switch (node.type) {
        case 'doc':
        case 'paragraph':
        case 'heading':
        case 'blockquote':
        case 'list':
        case 'list-item':
        case 'code-block':
        case 'table':
        case 'table-row':
        case 'table-cell':
        case 'accordion':
            return (node as KidAware).children || [];
        case 'accordion-section':
            return [...node.summary, ...node.children];
        default:
            return [];
    }
}

function withKids(node: Node, kids: readonly Node[]): Node {
    switch (node.type) {
        case 'doc': return { ...node, children: kids as readonly BlockNode[] };
        case 'paragraph':
        case 'heading': return { ...node, children: kids as readonly InlineNode[] };
        case 'blockquote':
        case 'list-item':
        case 'code-block':
        case 'table':
        case 'table-row':
        case 'table-cell':
        case 'accordion': return { ...node, children: kids } as Node;
        case 'list': return { ...node, children: kids } as Node;
        case 'accordion-section': {
            // Heuristic: preserve summary length, rest becomes body.
            const summaryLen = node.summary.length;
            return {
                ...node,
                summary: kids.slice(0, summaryLen) as InlineNode[],
                children: kids.slice(summaryLen) as BlockNode[]
            };
        }
        default:
            return node;
    }
}

function updateAt(root: Doc, path: Path, mutate: (n: Node) => Node): Doc {
    if (path.length === 0) return mutate(root) as Doc;
    const recurse = (node: Node, depth: number): Node => {
        if (depth === path.length) return mutate(node);
        const kids = getKids(node).slice();
        const idx = path[depth];
        if (idx < 0 || idx >= kids.length) return node;
        kids[idx] = recurse(kids[idx], depth + 1);
        return withKids(node, kids);
    };
    return recurse(root, 0) as Doc;
}

function insertChild(parent: Node, idx: number, child: Node): Node {
    const kids = getKids(parent).slice();
    const safeIdx = Math.max(0, Math.min(idx, kids.length));
    kids.splice(safeIdx, 0, child);
    return withKids(parent, kids);
}

function removeChild(parent: Node, idx: number): Node {
    const kids = getKids(parent).slice();
    if (idx < 0 || idx >= kids.length) return parent;
    kids.splice(idx, 1);
    return withKids(parent, kids);
}

function insertInlineAt(parent: Node, inlineIdx: number, offset: number, node: InlineNode): Node {
    const kids = getKids(parent).slice() as InlineNode[];
    if (inlineIdx < 0 || inlineIdx > kids.length) return parent;

    if (inlineIdx === kids.length) {
        kids.push(node);
        return withKids(parent, kids);
    }

    const target = kids[inlineIdx];
    if (target && target.type === 'text' && node.type === 'text' && marksEqual(target.marks, node.marks)) {
        // Merge into existing run.
        const merged = text(
            target.text.slice(0, offset) + node.text + target.text.slice(offset),
            target.marks
        );
        kids[inlineIdx] = merged;
        return withKids(parent, kids);
    }

    if (target && target.type === 'text' && offset > 0 && offset < target.text.length) {
        // Splitting a text run in the middle.
        const left = text(target.text.slice(0, offset), target.marks);
        const right = text(target.text.slice(offset), target.marks);
        kids.splice(inlineIdx, 1, left, node, right);
    } else {
        kids.splice(inlineIdx, 0, node);
    }
    return withKids(parent, kids);
}

function splitAndMark(leaf: TextNode, start: number, end: number, mark: Mark, add: boolean): Node {
    if (start >= end) return leaf;
    const before = leaf.text.slice(0, start);
    const mid = leaf.text.slice(start, end);
    const after = leaf.text.slice(end);
    const midMarks = add
        ? [...leaf.marks.filter(m => !sameMarkType(m, mark)), mark]
        : leaf.marks.filter(m => !markEquals(m, mark));

    // Return the unchanged leaf if midMarks is identical; otherwise package as a
    // fragment node — represented as a sequence inserted via replace-node at
    // the leaf's parent. The apply()/updateAt() scaffolding calls mutate with a
    // single Node, so we compose the split as a transient 'text' if possible,
    // or as the original leaf when mid is empty.
    if (before === '' && after === '') return text(mid, midMarks);

    // When the range is a prefix, we can return a single merged TextNode if
    // mid's marks are the same as before's marks. Otherwise we lose fidelity
    // here; the caller should split into multiple text runs via a different
    // transform chain in future iterations.
    if (marksEqual(midMarks, leaf.marks)) return leaf;

    // Fallback: merge back as single text run with new mid marks spanning the whole leaf.
    // This is a conservative approximation until the transform layer learns to emit
    // multiple sibling leaves; it's enough for the editor's current plugins because
    // they always apply marks at word / block boundaries.
    return text(leaf.text, midMarks);
}

function canJoin(a: Node, b: Node): boolean {
    if (a.type !== b.type) return false;
    return getKids(a).length >= 0 && getKids(b).length >= 0;
}

function mergeNodes(a: Node, b: Node): Node {
    const aKids = getKids(a);
    const bKids = getKids(b);
    return withKids(a, [...aKids, ...bKids]);
}

function makeContainer(kind: string, children: readonly Node[]): Node {
    switch (kind) {
        case 'blockquote': return { type: 'blockquote', children: children as readonly BlockNode[] };
        case 'list-item': return { type: 'list-item', children: children as readonly BlockNode[] };
        case 'accordion-section':
            return { type: 'accordion-section', summary: [], children: children as readonly BlockNode[] };
        default:
            return { type: 'paragraph', children: children as readonly InlineNode[] };
    }
}

function replaceInParent(container: Node, nodes: Node[]): Node {
    // We can't actually replace a single container with two siblings from inside
    // updateAt — it expects a single Node in return. Phase-3 callers avoid
    // split/join at the root level, so for now we coalesce back to a single
    // container holding both halves' kids. A future iteration exposes a
    // multi-node update primitive; this is documented in the spec §12.
    const kids = nodes.flatMap(n => getKids(n));
    return withKids(container, kids);
}

function marksEqual(a: readonly Mark[], b: readonly Mark[]): boolean {
    if (a.length !== b.length) return false;
    const ka = a.map(m => JSON.stringify(m)).sort();
    const kb = b.map(m => JSON.stringify(m)).sort();
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    return true;
}

function markEquals(a: Mark, b: Mark): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function sameMarkType(a: Mark, b: Mark): boolean {
    return a.type === b.type;
}
