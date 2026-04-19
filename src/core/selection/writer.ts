/**
 * Writer: apply a structured Selection back to the DOM. The only file
 * in the selection module that mutates `window.getSelection()`.
 */

import { assertNever } from './types';
import type { Point, Selection } from './types';

/**
 * Resolve a Point against the DOM tree rooted at `root`. Returns a
 * (Node, offset) pair suitable for `Range.setStart` / `setEnd`.
 *
 * Throws if the path does not resolve — callers must rebase or discard
 * stale selections before calling.
 */
export function pointToDom(root: HTMLElement, p: Point): { node: Node; offset: number } {
    let cursor: Node = root;
    for (let depth = 0; depth < p.path.length; depth++) {
        const idx = p.path[depth];
        const kids = cursor.childNodes;
        if (idx < 0 || idx >= kids.length) {
            throw new Error(`selection path out of range: [${p.path.join(',')}] at depth ${depth} (parent has ${kids.length} children)`);
        }
        cursor = kids[idx];
    }

    // cursor is the leaf. Validate offset against its kind.
    if (cursor.nodeType === Node.TEXT_NODE) {
        const len = (cursor as Text).length;
        if (p.offset < 0 || p.offset > len) {
            throw new Error(`selection offset ${p.offset} out of range for text node of length ${len}`);
        }
        return { node: cursor, offset: p.offset };
    }

    // Element leaf (empty paragraph, void element, etc.) — treat offset as
    // childNodes index. Valid offsets are 0..childNodes.length.
    const kidCount = cursor.childNodes.length;
    if (p.offset < 0 || p.offset > kidCount) {
        throw new Error(`selection offset ${p.offset} out of range for element with ${kidCount} children`);
    }
    return { node: cursor, offset: p.offset };
}

/**
 * Apply a structured Selection to the browser's live selection. Does
 * nothing for `{ kind: 'none' }`. Caller is expected to have focused
 * the editor first if a focus is required.
 */
export function writeSelection(root: HTMLElement, sel: Selection): void {
    switch (sel.kind) {
        case 'none':
            return;

        case 'caret': {
            const { node, offset } = pointToDom(root, sel.at);
            const r = document.createRange();
            r.setStart(node, offset);
            r.collapse(true);
            applyRange(r);
            return;
        }

        case 'range': {
            const a = pointToDom(root, sel.anchor);
            const f = pointToDom(root, sel.focus);
            const r = document.createRange();
            // A Range must go start -> end in document order. We preserve
            // anchor/focus semantics by using `setStart` + `setEnd` after
            // ordering; the browser selection API keeps track of the
            // anchor/focus distinction via the selection object itself.
            const order = orderPoints(a, f);
            r.setStart(order.start.node, order.start.offset);
            r.setEnd(order.end.node, order.end.offset);

            const browserSel = window.getSelection();
            if (!browserSel) return;
            browserSel.removeAllRanges();
            // Re-establish the anchor/focus direction by using extend
            // when the user's original anchor was *after* the focus.
            browserSel.addRange(r);
            if (order.reversed) {
                browserSel.collapseToEnd();
                try {
                    browserSel.extend(a.node, a.offset);
                } catch {
                    // extend() can throw if DOM state changed between ops;
                    // swallow — the selection is still well-formed.
                }
            }
            return;
        }

        default:
            assertNever(sel);
    }
}

function applyRange(r: Range): void {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
}

interface DomPoint {
    node: Node;
    offset: number;
}

function orderPoints(a: DomPoint, b: DomPoint): { start: DomPoint; end: DomPoint; reversed: boolean } {
    // Use a disposable range to ask the DOM which comes first.
    const probe = document.createRange();
    probe.setStart(a.node, a.offset);
    try {
        probe.setEnd(b.node, b.offset);
        return { start: a, end: b, reversed: false };
    } catch {
        // b is before a in document order.
        return { start: b, end: a, reversed: true };
    }
}
