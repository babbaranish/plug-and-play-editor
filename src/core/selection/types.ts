/**
 * Structured selection types. Positions are expressed in terms of the
 * editor's content tree (child-index path + leaf offset), not in terms
 * of live DOM nodes. This makes a Selection serialisable, comparable,
 * and resilient to DOM-node identity changes.
 *
 * The types form a discriminated union on `kind`; exhaustiveness is
 * enforced at the type level via the `never`-returning `assertNever`
 * helper below.
 */

/** An absolute position inside the editor's content tree. */
export interface Point {
    readonly kind: 'point';
    /**
     * Child-index path from the editor root down to the leaf text node.
     * Empty array means "inside the root element itself"; valid only when
     * the editor is empty.
     */
    readonly path: readonly number[];
    /** Character offset inside the leaf text node named by `path`. */
    readonly offset: number;
}

/** No live selection, or selection is outside the editor. */
export interface EmptySelection {
    readonly kind: 'none';
}

/** A collapsed selection (a caret). */
export interface CaretSelection {
    readonly kind: 'caret';
    readonly at: Point;
}

/**
 * An extended selection. `anchor` is where the user started selecting,
 * `focus` is where the caret is now — they can be in either document
 * order, so callers that need "start" and "end" must normalise via
 * `comparePoints` from path.ts.
 */
export interface RangeSelection {
    readonly kind: 'range';
    readonly anchor: Point;
    readonly focus: Point;
}

export type Selection = EmptySelection | CaretSelection | RangeSelection;

/** Construct a Point. */
export function point(path: readonly number[], offset: number): Point {
    return { kind: 'point', path: Object.freeze([...path]), offset };
}

/** The empty-selection singleton. */
export const NONE: EmptySelection = Object.freeze({ kind: 'none' });

/** Construct a caret Selection. */
export function caret(at: Point): CaretSelection {
    return { kind: 'caret', at };
}

/** Construct a range Selection. */
export function range(anchor: Point, focus: Point): RangeSelection {
    return { kind: 'range', anchor, focus };
}

/** Exhaustiveness helper for discriminated-union switches. */
export function assertNever(value: never): never {
    throw new Error(`unexpected selection variant: ${JSON.stringify(value)}`);
}
