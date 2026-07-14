/**
 * Parser / serializer round-trip tests.
 *
 * Environment: happy-dom (vitest config). The global `document` is used to
 * build DOM fixtures and to assert serializer output.
 *
 * The contract tested here is:
 *  - `parseDom(domFrom(html))` produces the expected structured Doc.
 *  - `serializeToHtml(doc)` produces the expected HTML for each fixture.
 *  - Parser normalisations (mark merging, empty-paragraph <br>) hold.
 *  - Round-tripping via `parse -> serialize -> parse` is idempotent in
 *    terms of the structured Doc.
 *
 * Note: DOM fixtures are built with `DOMParser` rather than assigning to
 * `innerHTML`, so the inputs are trusted static strings at parse time.
 */

import { describe, it, expect } from 'vitest';
import {
    parseDom,
    serializeToHtml,
    doc,
    paragraph,
    text,
    heading,
    blockquote,
    list,
    listItem,
    hr,
    hardBreak
} from './index';
import type { Doc } from './index';

function domFrom(html: string): HTMLElement {
    // Build a wrapper element containing the parsed fragment. DOMParser
    // avoids the innerHTML sink; the resulting body's children are moved
    // into a fresh <div> so callers get a uniform root.
    const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const wrapper = document.createElement('div');
    for (const child of Array.from(parsed.body.childNodes)) {
        wrapper.appendChild(document.importNode(child, true));
    }
    return wrapper;
}

function roundTrip(html: string): Doc {
    return parseDom(domFrom(serializeToHtml(parseDom(domFrom(html)))));
}

describe('parseDom — block structure', () => {
    it('parses a plain paragraph', () => {
        expect(parseDom(domFrom('<p>Hello</p>'))).toEqual(
            doc([paragraph([text('Hello')])])
        );
    });

    it('parses multiple paragraphs in order', () => {
        expect(parseDom(domFrom('<p>One</p><p>Two</p>'))).toEqual(
            doc([paragraph([text('One')]), paragraph([text('Two')])])
        );
    });

    it('parses headings h1–h6 with the correct level', () => {
        for (let lvl = 1; lvl <= 6; lvl++) {
            const html = `<h${lvl}>Title</h${lvl}>`;
            expect(parseDom(domFrom(html))).toEqual(
                doc([heading(lvl as 1 | 2 | 3 | 4 | 5 | 6, [text('Title')])])
            );
        }
    });

    it('parses a blockquote containing a paragraph', () => {
        expect(parseDom(domFrom('<blockquote><p>Quote</p></blockquote>'))).toEqual(
            doc([blockquote([paragraph([text('Quote')])])])
        );
    });

    it('parses an unordered list with one item', () => {
        expect(parseDom(domFrom('<ul><li>item</li></ul>'))).toEqual(
            doc([list(false, [listItem([paragraph([text('item')])])])])
        );
    });

    it('parses an ordered list with multiple items', () => {
        expect(parseDom(domFrom('<ol><li>1</li><li>2</li></ol>'))).toEqual(
            doc([
                list(true, [
                    listItem([paragraph([text('1')])]),
                    listItem([paragraph([text('2')])])
                ])
            ])
        );
    });

    it('parses a horizontal rule', () => {
        expect(parseDom(domFrom('<hr>'))).toEqual(doc([hr()]));
    });

    it('parses a paragraph containing a hard break', () => {
        expect(parseDom(domFrom('<p><br></p>'))).toEqual(
            doc([paragraph([hardBreak()])])
        );
    });

    it('parses text interleaved with a hard break', () => {
        expect(parseDom(domFrom('<p>a<br>b</p>'))).toEqual(
            doc([paragraph([text('a'), hardBreak(), text('b')])])
        );
    });
});

describe('parseDom — inline marks', () => {
    it('parses <strong> as a bold mark', () => {
        expect(parseDom(domFrom('<p><strong>bold</strong></p>'))).toEqual(
            doc([paragraph([text('bold', [{ type: 'bold' }])])])
        );
    });

    it('treats <b> as equivalent to <strong>', () => {
        expect(parseDom(domFrom('<p><b>bold</b></p>'))).toEqual(
            doc([paragraph([text('bold', [{ type: 'bold' }])])])
        );
    });

    it('parses <em> as italic', () => {
        expect(parseDom(domFrom('<p><em>it</em></p>'))).toEqual(
            doc([paragraph([text('it', [{ type: 'italic' }])])])
        );
    });

    it('parses <u> as underline', () => {
        expect(parseDom(domFrom('<p><u>u</u></p>'))).toEqual(
            doc([paragraph([text('u', [{ type: 'underline' }])])])
        );
    });

    it('parses <s>, <strike>, and <del> as strike', () => {
        for (const tag of ['s', 'strike', 'del']) {
            expect(parseDom(domFrom(`<p><${tag}>x</${tag}></p>`))).toEqual(
                doc([paragraph([text('x', [{ type: 'strike' }])])])
            );
        }
    });

    it('parses <code> as inline code', () => {
        expect(parseDom(domFrom('<p><code>c</code></p>'))).toEqual(
            doc([paragraph([text('c', [{ type: 'code' }])])])
        );
    });

    it('parses an anchor as a link mark', () => {
        expect(parseDom(domFrom('<p><a href="https://example.com">link</a></p>'))).toEqual(
            doc([
                paragraph([
                    text('link', [{ type: 'link', href: 'https://example.com' }])
                ])
            ])
        );
    });

    it('preserves target/rel on link marks', () => {
        const parsed = parseDom(
            domFrom('<p><a href="https://x.test" target="_blank" rel="noopener">x</a></p>')
        );
        expect(parsed).toEqual(
            doc([
                paragraph([
                    text('x', [
                        { type: 'link', href: 'https://x.test', target: '_blank', rel: 'noopener' }
                    ])
                ])
            ])
        );
    });

    it('splits a paragraph into three runs around a marked run', () => {
        expect(parseDom(domFrom('<p>Hello <strong>there</strong> world</p>'))).toEqual(
            doc([
                paragraph([
                    text('Hello '),
                    text('there', [{ type: 'bold' }]),
                    text(' world')
                ])
            ])
        );
    });

    it('stacks nested marks (bold + italic)', () => {
        const parsed = parseDom(domFrom('<p><strong><em>bi</em></strong></p>'));
        expect(parsed.children[0].type).toBe('paragraph');
        const p = parsed.children[0] as { children: readonly { marks: readonly { type: string }[] }[] };
        expect(p.children[0].marks.map(m => m.type).sort()).toEqual(['bold', 'italic']);
    });
});

describe('parseDom — mark merging', () => {
    it('keeps distinct text runs when marks differ', () => {
        const parsed = parseDom(domFrom('<p>a<strong>b</strong>c</p>'));
        expect(parsed).toEqual(
            doc([paragraph([text('a'), text('b', [{ type: 'bold' }]), text('c')])])
        );
        // three separate runs
        expect((parsed.children[0] as { children: readonly unknown[] }).children).toHaveLength(3);
    });

    it('merges adjacent runs with identical marks', () => {
        const parsed = parseDom(
            domFrom('<p><strong>a</strong><strong>b</strong></p>')
        );
        expect(parsed).toEqual(
            doc([paragraph([text('ab', [{ type: 'bold' }])])])
        );
    });

    it('merges adjacent unmarked text runs built via DOM APIs', () => {
        // Two adjacent text nodes (parser sees both as unmarked) should merge.
        const wrapper = document.createElement('div');
        const p = document.createElement('p');
        p.appendChild(document.createTextNode('foo'));
        p.appendChild(document.createTextNode('bar'));
        wrapper.appendChild(p);
        const parsed = parseDom(wrapper);
        expect(parsed).toEqual(doc([paragraph([text('foobar')])]));
    });

    it('does not merge a text run and a hard break', () => {
        const parsed = parseDom(domFrom('<p>a<br>b</p>'));
        const p = parsed.children[0] as { children: readonly { type: string }[] };
        expect(p.children.map(c => c.type)).toEqual(['text', 'break', 'text']);
    });
});

describe('serializeToHtml — fixtures', () => {
    it('serializes a plain paragraph', () => {
        expect(serializeToHtml(doc([paragraph([text('Hello')])]))).toBe('<p>Hello</p>');
    });

    it('serializes a heading', () => {
        expect(serializeToHtml(doc([heading(2, [text('Title')])]))).toBe('<h2>Title</h2>');
    });

    it('serializes an empty paragraph with <br>', () => {
        expect(serializeToHtml(doc([paragraph([])]))).toBe('<p><br></p>');
    });

    it('serializes a paragraph with an explicit hard break', () => {
        expect(serializeToHtml(doc([paragraph([hardBreak()])]))).toBe('<p><br></p>');
    });

    it('serializes bold text with <strong>', () => {
        expect(
            serializeToHtml(doc([paragraph([text('bold', [{ type: 'bold' }])])]))
        ).toBe('<p><strong>bold</strong></p>');
    });

    it('serializes a link mark', () => {
        expect(
            serializeToHtml(
                doc([
                    paragraph([
                        text('link', [{ type: 'link', href: 'https://example.com' }])
                    ])
                ])
            )
        ).toBe('<p><a href="https://example.com">link</a></p>');
    });

    it('serializes an unordered list, inlining single-paragraph items', () => {
        const tree = doc([list(false, [listItem([paragraph([text('item')])])])]);
        expect(serializeToHtml(tree)).toBe('<ul><li>item</li></ul>');
    });

    it('serializes an ordered list with multiple items', () => {
        const tree = doc([
            list(true, [
                listItem([paragraph([text('1')])]),
                listItem([paragraph([text('2')])])
            ])
        ]);
        expect(serializeToHtml(tree)).toBe('<ol><li>1</li><li>2</li></ol>');
    });

    it('serializes blockquote > paragraph', () => {
        expect(
            serializeToHtml(doc([blockquote([paragraph([text('Quote')])])]))
        ).toBe('<blockquote><p>Quote</p></blockquote>');
    });

    it('serializes an <hr>', () => {
        expect(serializeToHtml(doc([hr()]))).toBe('<hr>');
    });
});

describe('round-trip — parse -> serialize -> parse is idempotent', () => {
    const cases: Array<[string, string]> = [
        ['plain paragraph', '<p>Hello</p>'],
        ['heading', '<h2>Title</h2>'],
        ['blockquote', '<blockquote><p>Quote</p></blockquote>'],
        ['unordered list', '<ul><li>item</li></ul>'],
        ['ordered list', '<ol><li>1</li><li>2</li></ol>'],
        ['bold', '<p><strong>bold</strong></p>'],
        ['b normalises to strong', '<p><b>bold</b></p>'],
        ['mixed runs', '<p>Hello <strong>there</strong> world</p>'],
        ['empty paragraph', '<p><br></p>'],
        ['link', '<p><a href="https://example.com">link</a></p>'],
        ['hr', '<hr>']
    ];

    for (const [label, html] of cases) {
        it(`is stable for ${label}`, () => {
            const first = parseDom(domFrom(html));
            const second = roundTrip(html);
            expect(second).toEqual(first);
        });
    }

    it('normalises <b> and <strong> to the same Doc', () => {
        expect(parseDom(domFrom('<p><b>x</b></p>'))).toEqual(
            parseDom(domFrom('<p><strong>x</strong></p>'))
        );
    });

    it('normalises split bold runs to a single merged run', () => {
        // After serialization, <strong>a</strong><strong>b</strong> becomes
        // <strong>ab</strong>; the second parse therefore matches a single run.
        const parsed = parseDom(domFrom('<p><strong>a</strong><strong>b</strong></p>'));
        expect(parsed).toEqual(roundTrip('<p><strong>a</strong><strong>b</strong></p>'));
        expect(serializeToHtml(parsed)).toBe('<p><strong>ab</strong></p>');
    });
});
