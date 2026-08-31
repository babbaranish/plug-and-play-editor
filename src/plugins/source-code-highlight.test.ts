import { describe, it, expect } from 'vitest';
import { highlightHtml } from './source-code-highlight';

/**
 * The highlight overlay is painted underneath a transparent <textarea>.
 * Every visible glyph the user sees comes from the overlay, while the caret
 * comes from the textarea. If the overlay's plain text is not byte-identical
 * to the source, text goes missing / shifts and the caret lands "wrong".
 */
function overlayText(src: string): string {
    const el = document.createElement('div');
    el.innerHTML = highlightHtml(src);
    return el.textContent ?? '';
}

const CASES: Record<string, string> = {
    'valueless attribute': '<td nowrap>hi</td>',
    'partially typed attribute': '<td cla',
    'partially typed attr inside complete tag': '<td class>x</td>',
    'attr typed before existing ones': '<td cl style="color:red">x</td>',
    'self-closing without space': '<br/>',
    'self-closing with space': '<br />',
    'gt inside quoted attribute': '<td data-x="a>b" style="color:red">x</td>',
    'boolean attr on input': '<input type="checkbox" checked>',
    'unusual attr name': '<div @click="go" :class="c">x</div>',
    'plain nesting': '<table>\n  <tr>\n    <td>Hello</td>\n  </tr>\n</table>',
    'entities in text': '<p>a &amp; b &lt; c</p>',
    'comment': '<!-- a comment --><p>x</p>',
};

describe('highlightHtml', () => {
    for (const [name, src] of Object.entries(CASES)) {
        it(`renders every source character verbatim: ${name}`, () => {
            expect(overlayText(src)).toBe(src);
        });
    }
});

const TEMPLATE = [
    '<table role="presentation" cellpadding="0" border=0>',
    '  <tr>',
    '    <td nowrap align=center style="color:#333; padding:8px">',
    '      Hello &amp; welcome, {{name}} — 5 > 3 <br/>',
    '      <a href="https://x.test?a=1&b=2" target="_blank">Go</a>',
    '    </td>',
    '  </tr>',
    '</table>',
    '<!-- trailing note -->',
    '<hr />',
].join('\n');

describe('highlightHtml invariants', () => {
    it('survives typing: every prefix of a template round-trips', () => {
        const broken: string[] = [];
        for (let n = 0; n <= TEMPLATE.length; n++) {
            const prefix = TEMPLATE.slice(0, n);
            if (overlayText(prefix) !== prefix) broken.push(JSON.stringify(prefix.slice(-40)));
        }
        expect(broken).toEqual([]);
    });

    it('survives pasted junk: random HTML-ish strings round-trip', () => {
        const alphabet = [...'<>/="\'& \n\tabc-:@!{}[]#.', '<!--', '-->'];
        let seed = 20260831;
        const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

        const broken: string[] = [];
        for (let n = 0; n < 3000; n++) {
            let s = '';
            const len = 1 + Math.floor(rand() * 40);
            for (let k = 0; k < len; k++) s += alphabet[Math.floor(rand() * alphabet.length)];
            if (overlayText(s) !== s) broken.push(JSON.stringify(s));
        }
        expect(broken).toEqual([]);
    });

    it('still actually colours the tokens', () => {
        const html = highlightHtml('<td class="a">hi</td>');
        expect(html).toContain('pe-tok-tag');
        expect(html).toContain('pe-tok-attr-name');
        expect(html).toContain('pe-tok-attr-value');
        expect(html).toContain('pe-tok-text');
    });

    it('does not let markup in the source escape into the overlay', () => {
        const html = highlightHtml('<p>a</p><img src=x onerror="alert(1)">');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror="alert(1)"');
        expect(overlayText('<p>a</p><img src=x onerror="alert(1)">')).toBe(
            '<p>a</p><img src=x onerror="alert(1)">'
        );
    });
});
