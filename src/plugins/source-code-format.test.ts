import { describe, it, expect } from 'vitest';
import { formatHtml } from './source-code-format';

/** Mirrors the block list in source-code-format.ts, used to judge rendering-insignificant whitespace. */
const BLOCK_TAGS = new Set([
    'html', 'head', 'body', 'title', 'meta', 'link', 'base', 'style', 'script',
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'center',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'menu',
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'blockquote', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer',
    'address', 'figure', 'figcaption', 'form', 'fieldset', 'details', 'summary',
]);

const isBlockEl = (n: Node) => n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as Element).localName);
const isWsText = (n: Node) => n.nodeType === Node.TEXT_NODE && /^[ \t\n\r\f]*$/.test(n.textContent || '');

/**
 * Parses HTML and drops whitespace-only text that sits in a container holding block
 * children (rendering ignores it). Then returns one signature per element that holds
 * no block children: its tag and exact textContent (whitespace and nbsp included),
 * plus the textContent of the whole pruned document.
 */
function renderingSignature(html: string): { elements: string[]; text: string } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.documentElement;
    const prune = (el: Element) => {
        const kids = Array.from(el.childNodes);
        if (kids.some(isBlockEl)) {
            kids.forEach(k => { if (isWsText(k)) el.removeChild(k); });
        }
        Array.from(el.children).forEach(prune);
    };
    prune(root);

    const elements: string[] = [];
    root.querySelectorAll('*').forEach(el => {
        if (!Array.from(el.children).some(isBlockEl)) {
            elements.push(`${el.localName}|${el.textContent}`);
        }
    });
    return { elements, text: root.textContent || '' };
}

describe('formatHtml indentation', () => {
    it('indents nested block elements one level per nesting', () => {
        const src = '<div><p>Hello</p><ul><li>One</li><li>Two</li></ul></div>';
        expect(formatHtml(src)).toBe([
            '<div>',
            '  <p>Hello</p>',
            '  <ul>',
            '    <li>One</li>',
            '    <li>Two</li>',
            '  </ul>',
            '</div>',
        ].join('\n'));
    });

    it('indents a table email layout (table > tbody > tr > td > p)', () => {
        const src = '<table role="presentation"><tbody><tr><td><p>Hi</p></td></tr></tbody></table>';
        expect(formatHtml(src)).toBe([
            '<table role="presentation">',
            '  <tbody>',
            '    <tr>',
            '      <td>',
            '        <p>Hi</p>',
            '      </td>',
            '    </tr>',
            '  </tbody>',
            '</table>',
        ].join('\n'));
    });

    it('lays out block children of a block element and ignores existing whitespace between them', () => {
        const src = '<div>\n\n     <p>a</p>   \n\t<p>b</p>\n</div>';
        expect(formatHtml(src)).toBe('<div>\n  <p>a</p>\n  <p>b</p>\n</div>');
    });
});

describe('formatHtml inline content', () => {
    it('keeps inline content byte-equal on one line', () => {
        const src = '<p>Hello<strong>x</strong> <em>y</em>&nbsp;z</p>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps the space between two inline elements', () => {
        const src = '<p><strong>a</strong> <em>b</em></p>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps a block element inside an inline context on one line', () => {
        const src = '<span>x <div>y</div> z</span>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps text with runs of whitespace and newlines exactly', () => {
        const src = '<p>a   b\n  c</p>';
        expect(formatHtml(src)).toBe(src);
    });

    it('serialises U+00A0 as &nbsp; and keeps &nbsp; entities', () => {
        expect(formatHtml('<p>a&nbsp;b</p>')).toBe('<p>a&nbsp;b</p>');
        expect(formatHtml('<p>a b</p>')).toBe('<p>a&nbsp;b</p>');
    });

    it('does not treat a nbsp-only cell as whitespace', () => {
        expect(formatHtml('<table><tbody><tr><td>&nbsp;</td></tr></tbody></table>')).toContain('<td>&nbsp;</td>');
    });

    it('escapes & < > in text', () => {
        expect(formatHtml('<p>a &amp; b &lt; c &gt; d</p>')).toBe('<p>a &amp; b &lt; c &gt; d</p>');
    });

    it('keeps a root-level inline fragment on one line', () => {
        expect(formatHtml('Hello <b>x</b> there')).toBe('Hello <b>x</b> there');
    });
});

describe('formatHtml verbatim elements', () => {
    it('emits pre contents verbatim, including its whitespace', () => {
        const src = '<div>\n  <pre>  a\n    b  </pre>\n</div>';
        expect(formatHtml(src)).toBe('<div>\n  <pre>  a\n    b  </pre>\n</div>');
    });

    it('emits textarea and script contents verbatim', () => {
        const src = '<div><textarea>  x  </textarea><script>if (a < b) {}</script></div>';
        const out = formatHtml(src);
        expect(out).toContain('<textarea>  x  </textarea>');
        expect(out).toContain('<script>if (a < b) {}</script>');
    });
});

describe('formatHtml attributes', () => {
    it('keeps {{tokens}} and data-* attributes byte-for-byte', () => {
        const src = '<a href="{{ unsubscribe_link }}" data-href-token="{{ link }}" style="color:#333; padding:8px">Go</a>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps token attributes on a block element that gets indented', () => {
        const src = '<div data-href-token="{{link}}"><p class="x">{{name}}</p></div>';
        expect(formatHtml(src)).toBe('<div data-href-token="{{link}}">\n  <p class="x">{{name}}</p>\n</div>');
    });

    it('escapes & " < > inside attribute values', () => {
        const out = formatHtml(`<a title='a & "b"' href="x?a=1&amp;b=2">x</a>`);
        expect(out).toBe('<a title="a &amp; &quot;b&quot;" href="x?a=1&amp;b=2">x</a>');
        expect(formatHtml('<a title="a<b>c">x</a>')).toBe('<a title="a&lt;b&gt;c">x</a>');
    });

    it('does not escape single quotes or other characters inside attribute values', () => {
        expect(formatHtml(`<a title="it's">x</a>`)).toBe(`<a title="it's">x</a>`);
    });
});

/** A one-cell table around `inner`, formatted: the cell sits on one line, with the table tags indented around it. */
const inCell = (inner: string) => `<table><tbody><tr><td>${inner}</td></tr></tbody></table>`;
const cellOutput = (inner: string) => [
    '<table>',
    '  <tbody>',
    '    <tr>',
    `      <td>${inner}</td>`,
    '    </tr>',
    '  </tbody>',
    '</table>',
].join('\n');

describe('formatHtml inline display', () => {
    const COLUMNS = '<div style="display:inline-block;width:50%">A</div><div style="display:inline-block;width:50%">B</div>';

    it('keeps two inline-block columns on one line with no gap added', () => {
        expect(formatHtml(inCell(COLUMNS))).toBe(cellOutput(COLUMNS));
    });

    it('keeps the MSO hybrid pattern (inline-block divs around a conditional comment) adjacent', () => {
        const src = '<table><tbody><tr><td><div style="display:inline-block">A</div>'
            + '<!--[if mso]></td><td><![endif]-->'
            + '<div style="display:inline-block">B</div></td></tr></tbody></table>';
        expect(formatHtml(src)).toBe([
            '<table>',
            '  <tbody>',
            '    <tr>',
            '      <td><div style="display:inline-block">A</div><!--[if mso]></td><td><![endif]--><div style="display:inline-block">B</div></td>',
            '    </tr>',
            '  </tbody>',
            '</table>',
        ].join('\n'));
    });

    it.each([
        ['inline', 'display:inline'],
        ['inline-block', 'display:inline-block'],
        ['inline-flex', 'display:inline-flex'],
        ['inline-table', 'display:inline-table'],
        ['inline-grid', 'display:inline-grid'],
        ['mixed case and spaces', 'display :  Inline-Block  !important'],
    ])('treats a %s element as inline, so its parent stays on one line', (_name, decl) => {
        const inner = `<div style="${decl}"><p>x</p></div><div style="${decl}">y</div>`;
        expect(formatHtml(inCell(inner))).toBe(cellOutput(inner));
    });

    it('still indents block children when the display is block', () => {
        const src = '<div><div style="display:block"><p>a</p></div></div>';
        expect(formatHtml(src)).toBe('<div>\n  <div style="display:block">\n    <p>a</p>\n  </div>\n</div>');
    });

    it('lets the last display declaration win', () => {
        const src = '<div><div style="display:inline;display:block"><p>a</p></div><p>b</p></div>';
        expect(formatHtml(src)).toBe([
            '<div>',
            '  <div style="display:inline;display:block">',
            '    <p>a</p>',
            '  </div>',
            '  <p>b</p>',
            '</div>',
        ].join('\n'));
    });
});

describe('formatHtml white-space', () => {
    it.each(['pre', 'pre-wrap', 'pre-line', 'break-spaces'])(
        'writes an element with white-space:%s verbatim',
        value => {
            const src = `<div>\n  <div style="white-space:${value}">  a\n    b  <p>c</p></div>\n</div>`;
            expect(formatHtml(src)).toBe(
                `<div>\n  <div style="white-space:${value}">  a\n    b  <p>c</p></div>\n</div>`
            );
        }
    );

    it('keeps the whitespace of an inline element with white-space:pre-wrap on one line', () => {
        const src = '<p>x<span style="white-space: pre-wrap">  a\n  b </span>y</p>';
        expect(formatHtml(src)).toBe(src);
    });
});

describe('formatHtml conditional comments', () => {
    it('keeps a block context with a conditional comment on one line, byte-exact', () => {
        const src = '<div>\n  <p>a</p>\n  <!--[if mso]><p>x</p><![endif]-->\n  <p>b</p>\n</div>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps the downlevel-revealed form (<!--<![endif]-->) on one line', () => {
        const src = '<div><p>a</p><!--<![endif]--><p>b</p></div>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps the opening downlevel form (<!--[if !mso]><!-->) on one line', () => {
        const src = '<div><p>a</p><!--[if !mso]><!--><p>b</p><!--<![endif]--></div>';
        expect(formatHtml(src)).toBe(src);
    });

    it('still lays out a block context with an ordinary comment', () => {
        expect(formatHtml('<div><!-- note --><p>x</p></div>')).toBe('<div>\n  <!-- note -->\n  <p>x</p>\n</div>');
    });
});

describe('formatHtml template', () => {
    it('emits a template and its contents verbatim', () => {
        const src = '<div><p>a</p><template><p>  x  <span>y</span></p></template></div>';
        expect(formatHtml(src)).toBe(src);
    });

    it('keeps template contents when the template is the only child', () => {
        const src = '<div><template id="t"><p>x</p></template></div>';
        expect(formatHtml(src)).toBe(src);
    });
});

describe('formatHtml comments and void elements', () => {
    it('preserves comments between blocks on their own line', () => {
        const src = '<div><!-- header --><p>x</p></div>';
        expect(formatHtml(src)).toBe('<div>\n  <!-- header -->\n  <p>x</p>\n</div>');
    });

    it('preserves comments inside inline content', () => {
        const src = '<p>a<!-- c -->b</p>';
        expect(formatHtml(src)).toBe(src);
    });

    it('writes void elements without a closing tag', () => {
        const out = formatHtml('<div><p>a</p><hr><p>b</p></div>');
        expect(out).toBe('<div>\n  <p>a</p>\n  <hr />\n  <p>b</p>\n</div>');
        expect(out).not.toMatch(/<\/hr>|<\/br>|<\/img>/);
    });

    it('keeps br and img inline without closing tags', () => {
        expect(formatHtml('<p>Line<br>two <img src="a.png" alt=""></p>')).toBe(
            '<p>Line<br />two <img src="a.png" alt="" /></p>'
        );
    });
});

describe('formatHtml documents and fragments', () => {
    it('keeps the doctype, html, head and body of a full document', () => {
        const src = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title>'
            + '<style>p{color:red}</style></head><body><div><p>x</p></div></body></html>';
        expect(formatHtml(src)).toBe([
            '<!DOCTYPE html>',
            '<html lang="en">',
            '  <head>',
            '    <meta charset="utf-8" />',
            '    <title>T</title>',
            '    <style>p{color:red}</style>',
            '  </head>',
            '  <body>',
            '    <div>',
            '      <p>x</p>',
            '    </div>',
            '  </body>',
            '</html>',
        ].join('\n'));
    });

    it('does not add html or body to a fragment', () => {
        const out = formatHtml('<div><p>a</p></div>');
        expect(out).not.toMatch(/<html|<body|<head|<!doctype/i);
    });

    it('returns an empty string for empty or whitespace-only input', () => {
        expect(formatHtml('')).toBe('');
        expect(formatHtml('  \n\t ')).toBe('');
    });
});

const FIXTURES: Record<string, string> = {
    nested: '<div><p>Hello</p><ul><li>One</li><li>Two</li></ul></div>',
    inline: '<p>Hello<strong>x</strong> <em>y</em>&nbsp;z</p>',
    pre: '<div>\n  <pre>  a\n    b  </pre>\n</div>',
    comments: '<div><!-- header --><p>x</p></div><!-- end -->',
    voids: '<div><p>a</p><hr><p>b</p></div><p>Line<br>two</p>',
    tokens: '<td class="a" data-href-token="{{ link }}" nowrap><p>{{name}}</p><a href="x?a=1&b=2">Go</a></td>',
    table: [
        '<table role="presentation" cellpadding="0" border="0" width="100%">',
        '  <tbody>',
        '    <tr>',
        '      <td align="center" style="color:#333; padding:8px">',
        '        <p>Hello &amp; welcome, {{name}}, 5 &gt; 3</p>',
        '        <p>a&nbsp;&nbsp;b <strong>bold</strong> <em>it</em></p>',
        '      </td>',
        '    </tr>',
        '  </tbody>',
        '</table>',
        '<!-- trailing note -->',
    ].join('\n'),
    document: '<!DOCTYPE html><html><head><title>T</title></head><body><div><p>x</p></div></body></html>',
    rootText: 'Hello <b>x</b> there',
    emptyCell: '<table><tbody><tr><td>&nbsp;</td></tr></tbody></table>',
    inlineBlockColumns: inCell('<div style="display:inline-block;width:50%">A</div><div style="display:inline-block;width:50%">B</div>'),
    msoHybrid: '<table><tbody><tr><td><div style="display:inline-block">A</div><!--[if mso]></td><td><![endif]--><div style="display:inline-block">B</div></td></tr></tbody></table>',
    conditionalBlocks: '<div>\n  <p>a</p>\n  <!--[if mso]><p>x</p><![endif]-->\n  <p>b</p>\n</div>',
    whiteSpacePre: '<div>\n  <div style="white-space:pre">  a\n    b  <p>c</p></div>\n</div>',
    template: '<div><p>a</p><template><p>  x  <span>y</span></p></template></div>',
    attrAngles: '<a title="a<b>c" href="x?a=1&b=2">x</a>',
};

describe('formatHtml invariants', () => {
    for (const [name, src] of Object.entries(FIXTURES)) {
        it(`is idempotent: ${name}`, () => {
            const once = formatHtml(src);
            expect(formatHtml(once)).toBe(once);
        });

        it(`renders the same as the source: ${name}`, () => {
            const formatted = formatHtml(src);
            expect(renderingSignature(formatted)).toEqual(renderingSignature(src));
        });
    }
});
