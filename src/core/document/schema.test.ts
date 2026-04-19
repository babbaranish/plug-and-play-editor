import { describe, expect, it } from 'vitest';
import {
    BLOCK_TYPES,
    INLINE_TYPES,
    assertValid,
    isBlock,
    isContainer,
    isInline,
    nodeEquals,
    validate
} from './schema';
import {
    blockquote,
    doc,
    hardBreak,
    heading,
    hr,
    list,
    listItem,
    pageBreak,
    paragraph,
    text
} from './types';
import type { BlockNode, InlineNode, Mark, Node } from './types';

describe('validate', () => {
    it('returns empty array for an empty doc', () => {
        expect(validate(doc([]))).toEqual([]);
    });

    it('accepts a doc with paragraphs, headings, blockquotes, and lists', () => {
        const tree = doc([
            paragraph([text('hello')]),
            heading(1, [text('title')]),
            blockquote([paragraph([text('quoted')])]),
            list(false, [listItem([paragraph([text('item')])])]),
            hr(),
            pageBreak()
        ]);
        expect(validate(tree)).toEqual([]);
    });

    it('accepts hard-break as inline content in a paragraph', () => {
        const tree = doc([paragraph([text('a'), hardBreak(), text('b')])]);
        expect(validate(tree)).toEqual([]);
    });

    it('flags an inline text node placed directly under doc', () => {
        // Build an intentionally-illegal tree for the validator to reject.
        const bad = { type: 'doc', children: [text('stray')] } as unknown as Node;
        const errors = validate(bad);
        expect(errors.length).toBeGreaterThan(0);
        const illegal = errors.find(e => e.message.includes('illegal child of doc'));
        expect(illegal).toBeDefined();
        expect(illegal!.nodeType).toBe('text');
        expect(illegal!.path).toEqual([0]);
        expect(illegal!.message).toBe('illegal child of doc: text');
    });

    it('flags a paragraph placed directly inside a list (should be wrapped in list-item)', () => {
        const bad = doc([
            list(true, [paragraph([text('wrong')]) as unknown as ReturnType<typeof listItem>])
        ]);
        const errors = validate(bad);
        expect(errors.length).toBeGreaterThan(0);
        const illegal = errors.find(e => e.message === 'illegal child of list: paragraph');
        expect(illegal).toBeDefined();
        expect(illegal!.nodeType).toBe('paragraph');
        // path: children[0]=list, children[0]=offending paragraph
        expect(illegal!.path).toEqual([0, 0]);
    });

    it('flags a blockquote placed inside a paragraph (blocks can\'t nest in paragraphs)', () => {
        const bad = doc([
            paragraph([blockquote([paragraph([text('x')])]) as unknown as InlineNode])
        ]);
        const errors = validate(bad);
        const illegal = errors.find(e => e.message === 'illegal child of paragraph: blockquote');
        expect(illegal).toBeDefined();
        expect(illegal!.nodeType).toBe('blockquote');
        expect(illegal!.path).toEqual([0, 0]);
    });

    it('records deep paths for deeply-nested violations', () => {
        // doc > blockquote > paragraph > (illegal blockquote as inline)
        const bad = doc([
            blockquote([
                paragraph([blockquote([]) as unknown as InlineNode])
            ])
        ]);
        const errors = validate(bad);
        const illegal = errors.find(e => e.nodeType === 'blockquote' && e.message.startsWith('illegal child of paragraph'));
        expect(illegal).toBeDefined();
        expect(illegal!.path).toEqual([0, 0, 0]);
    });

    it('reports multiple errors for multiple violations in a single tree', () => {
        const bad = {
            type: 'doc',
            children: [text('one'), text('two')]
        } as unknown as Node;
        const errors = validate(bad);
        expect(errors.length).toBe(2);
        expect(errors.every(e => e.nodeType === 'text')).toBe(true);
        expect(errors.map(e => e.path)).toEqual([[0], [1]]);
    });
});

describe('assertValid', () => {
    it('returns undefined for a valid doc', () => {
        const result = assertValid(doc([paragraph([text('ok')])]));
        expect(result).toBeUndefined();
    });

    it('throws with a schema-violation report for an invalid doc', () => {
        const bad = { type: 'doc', children: [text('stray')] } as unknown as Node;
        expect(() => assertValid(bad)).toThrow(/document schema violation/);
    });

    it('throws even for a single violation', () => {
        const bad = doc([
            paragraph([blockquote([]) as unknown as InlineNode])
        ]);
        expect(() => assertValid(bad)).toThrow(/illegal child of paragraph/);
    });
});

describe('nodeEquals', () => {
    it('returns true for reference-identical nodes (fast path)', () => {
        const p = paragraph([text('same')]);
        expect(nodeEquals(p, p)).toBe(true);
    });

    it('returns true for structurally-identical independent trees', () => {
        const a = doc([paragraph([text('hi')])]);
        const b = doc([paragraph([text('hi')])]);
        expect(nodeEquals(a, b)).toBe(true);
    });

    it('returns false when node types differ', () => {
        expect(nodeEquals(paragraph([]), heading(1, []))).toBe(false);
    });

    it('returns false when text values differ', () => {
        expect(nodeEquals(text('hello'), text('world'))).toBe(false);
    });

    it('returns false when marks differ in content', () => {
        const a = text('x', [{ type: 'bold' }]);
        const b = text('x', [{ type: 'italic' }]);
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('returns true when marks are the same set in different order', () => {
        const marksA: Mark[] = [{ type: 'bold' }, { type: 'italic' }];
        const marksB: Mark[] = [{ type: 'italic' }, { type: 'bold' }];
        expect(nodeEquals(text('x', marksA), text('x', marksB))).toBe(true);
    });

    it('returns false when marks have different counts', () => {
        const a = text('x', [{ type: 'bold' }]);
        const b = text('x', [{ type: 'bold' }, { type: 'italic' }]);
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('returns false for paragraphs with different alignment', () => {
        const a: BlockNode = { type: 'paragraph', align: 'left', children: [text('x')] };
        const b: BlockNode = { type: 'paragraph', align: 'right', children: [text('x')] };
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('returns true for paragraphs with same alignment and children', () => {
        const a: BlockNode = { type: 'paragraph', align: 'center', children: [text('x')] };
        const b: BlockNode = { type: 'paragraph', align: 'center', children: [text('x')] };
        expect(nodeEquals(a, b)).toBe(true);
    });

    it('returns false when heading levels differ', () => {
        expect(nodeEquals(heading(1, [text('t')]), heading(2, [text('t')]))).toBe(false);
    });

    it('returns false when list ordering differs', () => {
        const a = list(true, [listItem([paragraph([text('x')])])]);
        const b = list(false, [listItem([paragraph([text('x')])])]);
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('returns false when children length differs', () => {
        const a = paragraph([text('a'), text('b')]);
        const b = paragraph([text('a')]);
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('returns true for deeply-nested equal structures', () => {
        const build = () =>
            doc([
                blockquote([
                    list(true, [
                        listItem([
                            paragraph([text('deep', [{ type: 'bold' }])])
                        ])
                    ])
                ])
            ]);
        expect(nodeEquals(build(), build())).toBe(true);
    });

    it('returns false when a deeply-nested leaf differs', () => {
        const a = doc([blockquote([paragraph([text('a')])])]);
        const b = doc([blockquote([paragraph([text('b')])])]);
        expect(nodeEquals(a, b)).toBe(false);
    });

    it('treats hr and page-break as type-only nodes', () => {
        expect(nodeEquals(hr(), hr())).toBe(true);
        expect(nodeEquals(pageBreak(), pageBreak())).toBe(true);
        expect(nodeEquals(hardBreak(), hardBreak())).toBe(true);
    });
});

describe('predicates', () => {
    it('isBlock returns true for block nodes', () => {
        expect(isBlock(paragraph([]))).toBe(true);
        expect(isBlock(heading(1, []))).toBe(true);
        expect(isBlock(blockquote([]))).toBe(true);
        expect(isBlock(hr())).toBe(true);
        expect(isBlock(pageBreak())).toBe(true);
    });

    it('isBlock returns false for inline nodes and containers that are not blocks', () => {
        expect(isBlock(text('hi'))).toBe(false);
        expect(isBlock(hardBreak())).toBe(false);
        expect(isBlock(listItem([]))).toBe(false);
        expect(isBlock(doc([]))).toBe(false);
    });

    it('isInline returns true for inline nodes', () => {
        expect(isInline(text('hi'))).toBe(true);
        expect(isInline(hardBreak())).toBe(true);
    });

    it('isInline returns false for block nodes', () => {
        expect(isInline(paragraph([]))).toBe(false);
        expect(isInline(heading(1, []))).toBe(false);
        expect(isInline(doc([]))).toBe(false);
    });

    it('isContainer returns true for container nodes', () => {
        expect(isContainer(doc([]))).toBe(true);
        expect(isContainer(paragraph([]))).toBe(true);
        expect(isContainer(heading(1, []))).toBe(true);
        expect(isContainer(blockquote([]))).toBe(true);
        expect(isContainer(list(false, []))).toBe(true);
        expect(isContainer(listItem([]))).toBe(true);
    });

    it('isContainer returns false for leaf nodes', () => {
        expect(isContainer(text('hi'))).toBe(false);
        expect(isContainer(hardBreak())).toBe(false);
        expect(isContainer(hr())).toBe(false);
        expect(isContainer(pageBreak())).toBe(false);
    });
});

describe('type-tag sets', () => {
    it('BLOCK_TYPES contains representative block types', () => {
        expect(BLOCK_TYPES.has('paragraph')).toBe(true);
        expect(BLOCK_TYPES.has('heading')).toBe(true);
        expect(BLOCK_TYPES.has('blockquote')).toBe(true);
        expect(BLOCK_TYPES.has('list')).toBe(true);
        expect(BLOCK_TYPES.has('hr')).toBe(true);
    });

    it('BLOCK_TYPES excludes inline and structural-only types', () => {
        expect(BLOCK_TYPES.has('text')).toBe(false);
        expect(BLOCK_TYPES.has('break')).toBe(false);
        expect(BLOCK_TYPES.has('list-item')).toBe(false);
        expect(BLOCK_TYPES.has('doc')).toBe(false);
    });

    it('INLINE_TYPES contains representative inline types', () => {
        expect(INLINE_TYPES.has('text')).toBe(true);
        expect(INLINE_TYPES.has('break')).toBe(true);
        expect(INLINE_TYPES.has('inline-image')).toBe(true);
        expect(INLINE_TYPES.has('mention')).toBe(true);
        expect(INLINE_TYPES.has('token')).toBe(true);
    });

    it('INLINE_TYPES excludes block types', () => {
        expect(INLINE_TYPES.has('paragraph')).toBe(false);
        expect(INLINE_TYPES.has('heading')).toBe(false);
        expect(INLINE_TYPES.has('blockquote')).toBe(false);
    });
});
