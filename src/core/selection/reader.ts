/**
 * Reader: resolve a live browser selection into a structured Selection
 * relative to an editor root. The only file in the selection module
 * that inspects `window.getSelection()`.
 */

import { NONE, caret, point, range } from './types';
import type { Point, Selection } from './types';

/**
 * Walk from a DOM (node, offset) pair up to `root`, producing a Point.
 * Returns null if `node` is not a descendant of `root`.
 *
 * Normalisation rules:
 *
 *  - If `node` is an Element and `offset` indexes its children, descend
 *    into `childNodes[offset]` when possible so the final Point is
 *    anchored in a Text leaf. When the element has no children (empty
 *    paragraph), we keep the Element as the leaf and use offset 0 — the
 *    writer handles that case symmetrically.
 *  - If `node` is a Text node, the offset is taken as a character index
 *    directly.
 *  - Zero-width text fragments are skipped by the child-index walk
 *    because they still occupy a childNodes slot; this keeps indices
 *    stable with the DOM's own indexing.
 */
export function domToPoint(root: HTMLElement, node: Node, offset: number): Point | null {
    if (!root.contains(node) && node !== root) return null;

    let leaf: Node = node;
    let leafOffset = offset;

    // Element-anchored selections: descend once so we land in a leaf.
    if (leaf.nodeType === Node.ELEMENT_NODE) {
        const el = leaf as Element;
        const children = el.childNodes;
        if (children.length === 0) {
            // Empty element (e.g., <p><br></p> before typing) — keep element
            // as leaf with offset 0. The writer understands this convention.
            leafOffset = 0;
        } else if (offset < children.length) {
            // Caret sits *before* children[offset].
            leaf = children[offset];
            leafOffset = 0;
        } else {
            // Caret sits after the last child. Anchor at end of last child.
            leaf = children[children.length - 1];
            if (leaf.nodeType === Node.TEXT_NODE) {
                leafOffset = (leaf as Text).length;
            } else {
                leafOffset = leaf.childNodes.length;
            }
        }
    }

    // Walk up to root, recording each step's child index.
    const path: number[] = [];
    let cursor: Node = leaf;
    while (cursor !== root) {
        const parent: Node | null = cursor.parentNode;
        if (!parent) return null; // detached
        const idx = indexOf(parent, cursor);
        if (idx < 0) return null;
        path.unshift(idx);
        cursor = parent;
    }

    return point(path, leafOffset);
}

function indexOf(parent: Node, child: Node): number {
    const kids = parent.childNodes;
    for (let i = 0; i < kids.length; i++) {
        if (kids[i] === child) return i;
    }
    return -1;
}

/**
 * Read the current `window.getSelection()` and resolve it against
 * `root`. Returns `{ kind: 'none' }` when there is no selection or the
 * selection is outside the editor.
 */
export function readSelection(root: HTMLElement): Selection {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return NONE;
    if (sel.anchorNode === null) return NONE;
    if (!root.contains(sel.anchorNode) && sel.anchorNode !== root) return NONE;

    const anchor = domToPoint(root, sel.anchorNode, sel.anchorOffset);
    if (!anchor) return NONE;

    if (sel.isCollapsed) return caret(anchor);

    if (sel.focusNode === null) return caret(anchor);
    const focus = domToPoint(root, sel.focusNode, sel.focusOffset);
    if (!focus) return caret(anchor);

    return range(anchor, focus);
}
