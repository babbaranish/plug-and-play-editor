/**
 * Pure path math. No DOM, no side effects — everything here is
 * unit-testable in isolation.
 *
 * A `Path` names a descendant of the editor root by child indices. The
 * empty path `[]` refers to the root itself.
 */

import type { Point } from './types';

export type Path = readonly number[];

/** Three-way comparison: -1 if a before b, 0 if equal, +1 if a after b. */
export function comparePaths(a: Path, b: Path): -1 | 0 | 1 {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
}

/** Document-order comparison of Points, considering offset. */
export function comparePoints(a: Point, b: Point): -1 | 0 | 1 {
    const byPath = comparePaths(a.path, b.path);
    if (byPath !== 0) return byPath;
    if (a.offset < b.offset) return -1;
    if (a.offset > b.offset) return 1;
    return 0;
}

/** True iff `ancestor` is a strict ancestor of `descendant`. */
export function isAncestor(ancestor: Path, descendant: Path): boolean {
    if (ancestor.length >= descendant.length) return false;
    for (let i = 0; i < ancestor.length; i++) {
        if (ancestor[i] !== descendant[i]) return false;
    }
    return true;
}

/** Returns the common ancestor path of two paths. */
export function commonAncestor(a: Path, b: Path): Path {
    const out: number[] = [];
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) break;
        out.push(a[i]);
    }
    return out;
}
