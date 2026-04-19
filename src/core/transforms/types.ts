/**
 * Transform ADT: the atomic, invertible units of change to the document.
 *
 * Every mutation the editor makes can (eventually) be described as one
 * or more of these. A Transform carries enough information to:
 *
 *   1. Apply itself to a document-model `Doc` (→ new Doc).
 *   2. Be inverted into a sibling Transform that undoes it exactly.
 *   3. Be transformed against a concurrent Transform for OT (Phase 4).
 *
 * Transforms live in `src/core/transforms/` and are deliberately
 * independent of both the DOM and the concrete Editor class. They take
 * a Doc and return a Doc.
 *
 * The current Phase-3 scope implements (1) and (2). OT (3) is the next
 * phase.
 */

import type { BlockNode, InlineNode, Mark, Node, NodeType } from '../document';
import type { Path } from '../selection';

/** Insert a single inline node at the given position. */
export interface InsertInlineTransform {
    readonly kind: 'insert-inline';
    readonly at: { readonly path: Path; readonly offset: number };
    readonly node: InlineNode;
}

/** Insert a single block at the given index inside a container. */
export interface InsertBlockTransform {
    readonly kind: 'insert-block';
    readonly parent: Path;
    readonly index: number;
    readonly node: BlockNode;
}

/** Delete an inline range `[start, end)` from a leaf text run. */
export interface DeleteTextTransform {
    readonly kind: 'delete-text';
    readonly path: Path;
    readonly start: number;
    readonly end: number;
    /** The removed text, captured so we can invert. */
    readonly removed: string;
}

/** Remove a block at an index; the block is captured for inversion. */
export interface RemoveBlockTransform {
    readonly kind: 'remove-block';
    readonly parent: Path;
    readonly index: number;
    readonly removed: BlockNode;
}

/** Replace text inside a leaf at a specific offset window. */
export interface ReplaceTextTransform {
    readonly kind: 'replace-text';
    readonly path: Path;
    readonly start: number;
    readonly end: number;
    readonly insert: string;
    /** The displaced text, captured for inversion. */
    readonly removed: string;
}

/** Set an attribute (or metadata field) on an addressable node. */
export interface SetAttributeTransform<V = unknown> {
    readonly kind: 'set-attr';
    readonly path: Path;
    readonly attribute: string;
    readonly previous: V | undefined;
    readonly next: V | undefined;
}

/** Add a mark across an inline range. */
export interface AddMarkTransform {
    readonly kind: 'add-mark';
    readonly path: Path;
    readonly start: number;
    readonly end: number;
    readonly mark: Mark;
}

/** Remove a mark across an inline range. */
export interface RemoveMarkTransform {
    readonly kind: 'remove-mark';
    readonly path: Path;
    readonly start: number;
    readonly end: number;
    readonly mark: Mark;
}

/** Move a block from one container index to another. */
export interface MoveBlockTransform {
    readonly kind: 'move-block';
    readonly from: { readonly parent: Path; readonly index: number };
    readonly to: { readonly parent: Path; readonly index: number };
}

/** Split a container at a given child index into two siblings. */
export interface SplitTransform {
    readonly kind: 'split';
    readonly parent: Path;
    readonly index: number;
}

/** Join two adjacent siblings at `parent.children[index]` and `[index+1]`. */
export interface JoinTransform {
    readonly kind: 'join';
    readonly parent: Path;
    readonly index: number;
}

/** Wrap a range of children in a new container block. */
export interface WrapTransform {
    readonly kind: 'wrap';
    readonly parent: Path;
    readonly start: number;
    readonly end: number;
    readonly wrapperType: NodeType;
}

/** Undo a Wrap: replace a container with its children. */
export interface UnwrapTransform {
    readonly kind: 'unwrap';
    readonly parent: Path;
    readonly index: number;
    /** Captured for inversion — the container type we removed. */
    readonly removedType: NodeType;
}

/** Replace an entire node subtree. Used for coarse-grained edits. */
export interface ReplaceNodeTransform {
    readonly kind: 'replace-node';
    readonly path: Path;
    readonly previous: Node;
    readonly next: Node;
}

export type Transform =
    | InsertInlineTransform
    | InsertBlockTransform
    | DeleteTextTransform
    | RemoveBlockTransform
    | ReplaceTextTransform
    | SetAttributeTransform
    | AddMarkTransform
    | RemoveMarkTransform
    | MoveBlockTransform
    | SplitTransform
    | JoinTransform
    | WrapTransform
    | UnwrapTransform
    | ReplaceNodeTransform;

export type TransformKind = Transform['kind'];
