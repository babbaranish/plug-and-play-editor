import { describe, it, expect } from 'vitest';
import { generateButtonHtmlForTest } from './button-block';

const cfg = (over: Record<string, unknown> = {}) => ({
    text: 'Pay now',
    url: 'https://pay.test/abc',
    paddingV: 12,
    paddingH: 24,
    textColor: '#ffffff',
    bgColor: '#d63736',
    borderRadius: 4,
    ...over,
} as Parameters<typeof generateButtonHtmlForTest>[0]);

const anchorOf = (html: string): HTMLAnchorElement => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.querySelector('a') as HTMLAnchorElement;
};

describe('generateButtonHtml', () => {
    it('writes an ordinary url through untouched', () => {
        const a = anchorOf(generateButtonHtmlForTest(cfg()));
        expect(a.getAttribute('href')).toBe('https://pay.test/abc');
        expect(a.textContent).toBe('Pay now');
    });

    it('keeps a token destination intact, braces and all', () => {
        const a = anchorOf(generateButtonHtmlForTest(cfg({ url: '{{Fee:abc:link-1:PaymentLink}}' })));
        expect(a.getAttribute('href')).toBe('{{Fee:abc:link-1:PaymentLink}}');
    });

    it('does not let a quote in the url close the href and add an attribute', () => {
        // The escaper used to be textContent -> innerHTML, which leaves `"`
        // alone. This exact url produced a real onmouseover on the anchor.
        const html = generateButtonHtmlForTest(cfg({ url: 'https://x.test" onmouseover="alert(1)' }));
        const a = anchorOf(html);
        expect(a.getAttribute('onmouseover')).toBeNull();
        expect(a.getAttribute('href')).toBe('https://x.test" onmouseover="alert(1)');
        expect(a.attributes.length).toBe(4); // href, target, rel, style
    });

    it('does not let a quote in the url break out into a new tag', () => {
        const a = anchorOf(generateButtonHtmlForTest(cfg({ url: 'https://x.test"><script>alert(1)</script>' })));
        expect(a.getAttribute('href')).toBe('https://x.test"><script>alert(1)</script>');
        expect(a.querySelector('script')).toBeNull();
    });

    it('still escapes markup in the button text', () => {
        const a = anchorOf(generateButtonHtmlForTest(cfg({ text: '<img src=x onerror=alert(1)>' })));
        expect(a.querySelector('img')).toBeNull();
        expect(a.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('escapes an ampersand in a query string without double-escaping it', () => {
        const a = anchorOf(generateButtonHtmlForTest(cfg({ url: 'https://pay.test/a?x=1&y=2' })));
        expect(a.getAttribute('href')).toBe('https://pay.test/a?x=1&y=2');
    });
});
