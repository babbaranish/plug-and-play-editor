/**
 * Diffing renderer: reconcile a target HTMLElement's contents so they
 * match a Doc. Uses a minimal virtual-DOM-style diff keyed on
 * `nodeEquals` from schema.ts: unchanged subtrees are left in place
 * (preserving selection), and only the differences are mutated.
 *
 * This is simpler than React-style fibers because our tree is shallow
 * and there are no components / hooks / lifecycle — just nodes and
 * their children. The algorithm:
 *
 *   1. Materialise the new Doc as a DocumentFragment via serializer.
 *   2. Walk the existing container children in lockstep with the new
 *      fragment's children.
 *   3. If the Nth live child already structurally matches the Nth new
 *      child (by tag + key attributes), recurse into it.
 *   4. Otherwise replace, insert, or remove to realign.
 *
 * The renderer is intentionally additive: it does NOT take over ownership
 * of the editor's DOM today. Plugins still mutate the DOM through
 * `execCommand` and direct node edits; the renderer is available when
 * the Editor wants to apply a document-model-level change as a single
 * atomic reconciliation.
 */

import type { Doc } from './types';
import { serializeToDom } from './serializer';

export interface RenderResult {
    readonly replaced: number;
    readonly inserted: number;
    readonly removed: number;
    readonly recursed: number;
}

/**
 * Render `next` into `target`, minimising DOM churn. Returns diagnostics
 * about the reconciliation for test assertions.
 */
export function render(target: HTMLElement, next: Doc): RenderResult {
    const fragment = serializeToDom(next, target.ownerDocument);
    const stats: Mutable<RenderResult> = { replaced: 0, inserted: 0, removed: 0, recursed: 0 };
    diffChildren(target, fragment, stats);
    return stats;
}

interface Mutable<T> {
    replaced: number;
    inserted: number;
    removed: number;
    recursed: number;
}

function diffChildren(live: globalThis.Node, next: globalThis.Node, stats: Mutable<RenderResult>): void {
    const liveKids = Array.from(live.childNodes);
    const nextKids = Array.from(next.childNodes);

    const common = Math.min(liveKids.length, nextKids.length);
    for (let i = 0; i < common; i++) {
        const a = liveKids[i];
        const b = nextKids[i];
        if (sameShape(a, b)) {
            // Same tag / same text; recurse or leave alone.
            if (a.nodeType === globalThis.Node.TEXT_NODE) {
                if ((a as Text).data !== (b as Text).data) {
                    (a as Text).data = (b as Text).data;
                    stats.replaced++;
                }
            } else {
                reconcileAttributes(a as Element, b as Element);
                diffChildren(a, b, stats);
                stats.recursed++;
            }
        } else {
            // Replace — keep b's subtree (it came from the fresh fragment).
            live.replaceChild(b, a);
            stats.replaced++;
        }
    }

    // Remove surplus on the live side.
    while (liveKids.length > nextKids.length) {
        const extra = liveKids.pop();
        if (extra && extra.parentNode === live) {
            live.removeChild(extra);
            stats.removed++;
        }
    }

    // Append new children that weren't present.
    for (let i = common; i < nextKids.length; i++) {
        live.appendChild(nextKids[i]);
        stats.inserted++;
    }
}

function sameShape(a: globalThis.Node, b: globalThis.Node): boolean {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType === globalThis.Node.TEXT_NODE) return true;
    if (a.nodeType === globalThis.Node.ELEMENT_NODE) {
        return (a as Element).tagName === (b as Element).tagName;
    }
    return false;
}

function reconcileAttributes(live: Element, next: Element): void {
    const liveAttrs = new Set<string>();
    for (let i = 0; i < live.attributes.length; i++) liveAttrs.add(live.attributes[i].name);

    const nextAttrs = new Set<string>();
    for (let i = 0; i < next.attributes.length; i++) {
        const attr = next.attributes[i];
        nextAttrs.add(attr.name);
        if (live.getAttribute(attr.name) !== attr.value) {
            live.setAttribute(attr.name, attr.value);
        }
    }
    for (const name of liveAttrs) {
        if (!nextAttrs.has(name)) live.removeAttribute(name);
    }
}
