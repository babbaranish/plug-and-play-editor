/**
 * Public re-exports for the structured selection module.
 *
 * Consumers should import from here, not from individual files:
 *
 *   import { readSelection, writeSelection, point, caret, range } from '.../selection';
 */

export type { Point, Selection, CaretSelection, RangeSelection, EmptySelection } from './types';
export { NONE, point, caret, range, assertNever } from './types';
export { comparePaths, comparePoints, isAncestor, commonAncestor } from './path';
export type { Path } from './path';
export { readSelection, domToPoint } from './reader';
export { writeSelection, pointToDom } from './writer';
