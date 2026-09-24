import { describe, it, expect } from 'vitest';
import { findOffsets, replaceAllLiteral } from './find-replace';

describe('findOffsets', () => {
    it('finds every case-insensitive occurrence', () => {
        expect(findOffsets('Fee fee FEE', 'fee')).toEqual([0, 4, 8]);
    });
    it('does not overlap matches', () => {
        expect(findOffsets('aaaa', 'aa')).toEqual([0, 2]);
    });
    it('finds nothing for an empty query', () => {
        expect(findOffsets('abc', '')).toEqual([]);
    });
});

describe('replaceAllLiteral', () => {
    it('replaces case-insensitively', () => {
        expect(replaceAllLiteral('<p>Fee</p><p>fee</p>', 'fee', 'Charge')).toBe('<p>Charge</p><p>Charge</p>');
    });
    it('treats $ patterns in the replacement as plain text', () => {
        expect(replaceAllLiteral('price', 'price', '$& $1 $$')).toBe('$& $1 $$');
    });
});
