import { describe, it, expect } from 'vitest';
import { isValidLinkUrl, isPlainTextAnchor } from './links';

const CURLY = ['{{', '}}'] as const;

describe('isValidLinkUrl', () => {
    const valid = (url: string) => isValidLinkUrl(url, CURLY[0], CURLY[1]);

    it('accepts ordinary web and mail addresses', () => {
        expect(valid('https://example.com')).toBe(true);
        expect(valid('http://example.com/a?b=1#c')).toBe(true);
        expect(valid('mailto:someone@example.com')).toBe(true);
    });

    it('accepts a URL that is entirely a variable', () => {
        expect(valid('{{unsubscribe_url}}')).toBe(true);
        expect(valid('  {{preferences_url}}  ')).toBe(true);
    });

    it('accepts variables embedded in a real URL', () => {
        expect(valid('https://example.com/u/{{user_id}}')).toBe(true);
        expect(valid('https://{{domain}}/unsubscribe')).toBe(true);
        expect(valid('mailto:{{email}}')).toBe(true);
    });

    it('accepts a variable standing in for the origin', () => {
        expect(valid('{{base_url}}/unsubscribe')).toBe(true);
        expect(valid('{{base_url}}?u={{user_id}}')).toBe(true);
        expect(valid('{{base_url}}#section')).toBe(true);
    });

    it('rejects empty and unparseable input', () => {
        expect(valid('')).toBe(false);
        expect(valid('   ')).toBe(false);
        expect(valid('not a url')).toBe(false);
    });

    it('rejects script-bearing schemes', () => {
        expect(valid('javascript:alert(1)')).toBe(false);
        expect(valid('JaVaScRiPt:alert(1)')).toBe(false);
        expect(valid('  javascript:alert(1)')).toBe(false);
        expect(valid('java\tscript:alert(1)')).toBe(false);
        expect(valid('data:text/html,<script>alert(1)</script>')).toBe(false);
        expect(valid('vbscript:msgbox')).toBe(false);
        expect(valid('file:///etc/passwd')).toBe(false);
    });

    it('does not let a leading variable smuggle a script scheme past the check', () => {
        // If {{a}} expands to nothing the href would become javascript:alert(1).
        expect(valid('{{a}}javascript:alert(1)')).toBe(false);
        expect(valid('{{a}}data:text/html,x')).toBe(false);
    });

    it('honours a non-default delimiter style', () => {
        expect(isValidLinkUrl('%unsubscribe_url%', '%', '%')).toBe(true);
        expect(isValidLinkUrl('https://example.com/%user_id%', '%', '%')).toBe(true);
        // ...and the curly form is not special-cased when percent is configured
        expect(isValidLinkUrl('{{unsubscribe_url}}', '%', '%')).toBe(false);
    });
});

describe('isPlainTextAnchor', () => {
    const anchor = (html: string): HTMLAnchorElement => {
        const host = document.createElement('div');
        host.innerHTML = html;
        return host.querySelector('a')!;
    };

    it('is true for a text-only anchor', () => {
        expect(isPlainTextAnchor(anchor('<a href="#">Click here</a>'))).toBe(true);
    });

    it('is true for an empty anchor', () => {
        expect(isPlainTextAnchor(anchor('<a href="#"></a>'))).toBe(true);
    });

    it('is false when the anchor wraps markup', () => {
        expect(isPlainTextAnchor(anchor('<a href="#"><strong>Bold</strong></a>'))).toBe(false);
        expect(isPlainTextAnchor(anchor('<a href="#">see <em>this</em></a>'))).toBe(false);
        expect(isPlainTextAnchor(anchor('<a href="#"><img src="x"></a>'))).toBe(false);
    });
});

describe('isValidLinkUrl \u2014 scheme-check normalization', () => {
    const valid = (url: string) => isValidLinkUrl(url, CURLY[0], CURLY[1]);

    // Browsers strip these characters before resolving the scheme, so the guard must too.
    it('rejects script schemes split by characters browsers strip', () => {
        expect(valid('java\tscript:alert(1)')).toBe(false);
        expect(valid('java\nscript:alert(1)')).toBe(false);
        expect(valid('java\rscript:alert(1)')).toBe(false);
        expect(valid('javascript\t:alert(1)')).toBe(false);
        expect(valid(' javascript:alert(1)')).toBe(false);
    });

    it('rejects a leading variable followed by a split script scheme', () => {
        expect(valid('{{a}}java\tscript:alert(1)')).toBe(false);
    });
});
