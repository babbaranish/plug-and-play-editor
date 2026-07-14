import { describe, it, expect } from 'vitest';
import { comparePaths, comparePoints, isAncestor, commonAncestor } from './path';
import { point } from './types';

describe('comparePaths', () => {
    it('returns 0 for two empty paths', () => {
        expect(comparePaths([], [])).toBe(0);
    });

    it('returns 0 for identical non-empty paths', () => {
        expect(comparePaths([1, 2, 3], [1, 2, 3])).toBe(0);
    });

    it('returns -1 when first differing index is smaller', () => {
        expect(comparePaths([1, 2, 3], [1, 3, 0])).toBe(-1);
    });

    it('returns 1 when first differing index is larger', () => {
        expect(comparePaths([2], [1, 99])).toBe(1);
    });

    it('returns -1 when a is a strict prefix of b (a comes first)', () => {
        expect(comparePaths([1, 2], [1, 2, 0])).toBe(-1);
    });

    it('returns 1 when b is a strict prefix of a', () => {
        expect(comparePaths([1, 2, 0], [1, 2])).toBe(1);
    });

    it('treats the empty path as before any non-empty path', () => {
        expect(comparePaths([], [0])).toBe(-1);
        expect(comparePaths([5], [])).toBe(1);
    });

    it('compares deep paths lexicographically by index', () => {
        expect(comparePaths([1, 2, 3, 4], [1, 2, 3, 5])).toBe(-1);
        expect(comparePaths([1, 2, 3, 4], [1, 2, 4, 0])).toBe(-1);
        expect(comparePaths([9, 0, 0, 0], [1, 9, 9, 9])).toBe(1);
    });
});

describe('comparePoints', () => {
    it('returns 0 for points at identical path and offset', () => {
        expect(comparePoints(point([1, 2], 3), point([1, 2], 3))).toBe(0);
    });

    it('breaks ties by offset when paths are equal', () => {
        expect(comparePoints(point([1, 2], 0), point([1, 2], 5))).toBe(-1);
        expect(comparePoints(point([1, 2], 5), point([1, 2], 0))).toBe(1);
    });

    it('orders by path before consulting offset', () => {
        // Path [1,0] < [1,1], even though the first point has a huge offset.
        expect(comparePoints(point([1, 0], 9999), point([1, 1], 0))).toBe(-1);
    });

    it('handles empty-path points with offsets', () => {
        expect(comparePoints(point([], 0), point([], 0))).toBe(0);
        expect(comparePoints(point([], 2), point([], 5))).toBe(-1);
        expect(comparePoints(point([], 7), point([0], 0))).toBe(-1);
    });

    it('respects prefix ordering at the path level', () => {
        // Shorter path (ancestor) is ordered before longer descendant regardless of offset.
        expect(comparePoints(point([1], 100), point([1, 0], 0))).toBe(-1);
        expect(comparePoints(point([1, 0], 0), point([1], 100))).toBe(1);
    });
});

describe('isAncestor', () => {
    it('is false for two equal paths (strict)', () => {
        expect(isAncestor([1], [1])).toBe(false);
        expect(isAncestor([], [])).toBe(false);
        expect(isAncestor([1, 2, 3], [1, 2, 3])).toBe(false);
    });

    it('is true when ancestor is a strict prefix of descendant', () => {
        expect(isAncestor([1], [1, 0])).toBe(true);
        expect(isAncestor([1, 2], [1, 2, 3, 4])).toBe(true);
    });

    it('treats the empty path as an ancestor of every non-empty path', () => {
        expect(isAncestor([], [0])).toBe(true);
        expect(isAncestor([], [1, 2, 3])).toBe(true);
    });

    it('is false when paths diverge at some index', () => {
        expect(isAncestor([1, 2], [1, 3, 0])).toBe(false);
        expect(isAncestor([0], [1, 0])).toBe(false);
    });

    it('is false when "ancestor" is actually longer than the other path', () => {
        expect(isAncestor([1, 2, 3], [1, 2])).toBe(false);
        expect(isAncestor([0], [])).toBe(false);
    });
});

describe('commonAncestor', () => {
    it('returns [] when one of the paths is empty', () => {
        expect(commonAncestor([], [1, 2])).toEqual([]);
        expect(commonAncestor([1, 2], [])).toEqual([]);
        expect(commonAncestor([], [])).toEqual([]);
    });

    it('returns the full path when both paths are identical', () => {
        expect(commonAncestor([1, 2], [1, 2])).toEqual([1, 2]);
        expect(commonAncestor([0], [0])).toEqual([0]);
    });

    it('returns the longest shared prefix when paths diverge', () => {
        expect(commonAncestor([1, 2, 3], [1, 2, 4])).toEqual([1, 2]);
        expect(commonAncestor([1, 2, 3, 4], [1, 2, 3, 5, 6])).toEqual([1, 2, 3]);
    });

    it('returns [] when paths diverge at the very first index', () => {
        expect(commonAncestor([0, 1, 2], [1, 0, 0])).toEqual([]);
    });

    it('returns the shorter path when it is a strict prefix of the longer', () => {
        expect(commonAncestor([1, 2], [1, 2, 3, 4])).toEqual([1, 2]);
        expect(commonAncestor([1, 2, 3, 4], [1, 2])).toEqual([1, 2]);
    });

    it('returns a fresh mutable array (does not alias either input)', () => {
        const a: readonly number[] = [1, 2, 3];
        const b: readonly number[] = [1, 2, 4];
        const result = commonAncestor(a, b);
        expect(result).toEqual([1, 2]);
        expect(result).not.toBe(a);
        expect(result).not.toBe(b);
    });
});
