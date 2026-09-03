import { describe, it, expect } from 'vitest';
import {
    isValidLinkUrl,
    isPlainTextAnchor,
    applyLinkAttrsForTest,
    displayUrlForTest,
    resolveTokenReference
} from './links';

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

describe('a link whose destination is a variable', () => {
    // An href holds text, so a variable typed into the URL field is
    // percent-encoded by the browser and indistinguishable from a real address
    // afterwards. It is stored in data-href-token instead, with an inert href.
    const open = '{{';
    const close = '}}';

    const dialogFor = (html: string) => {
        const host = document.createElement('div');
        host.innerHTML = html;
        return host.querySelector('a') as HTMLAnchorElement;
    };

    it('stores a token-only URL as a destination attribute, never in href', () => {
        const a = dialogFor('<a>Pay</a>');
        applyLinkAttrsForTest(a, '{{payment_link}}', open, close);
        expect(a.getAttribute('data-href-token')).toBe('payment_link');
        expect(a.getAttribute('href')).toBe('#');
    });

    it('keeps a real address in href and carries no token', () => {
        const a = dialogFor('<a>Pay</a>');
        applyLinkAttrsForTest(a, 'https://x.test/pay', open, close);
        expect(a.getAttribute('href')).toBe('https://x.test/pay');
        expect(a.hasAttribute('data-href-token')).toBe(false);
    });

    it('treats a URL merely containing a variable as a real address', () => {
        const a = dialogFor('<a>Pay</a>');
        applyLinkAttrsForTest(a, 'https://x.test/{{id}}', open, close);
        expect(a.getAttribute('href')).toBe('https://x.test/{{id}}');
        expect(a.hasAttribute('data-href-token')).toBe(false);
    });

    it('clears a stale token when the link is re-pointed at an address', () => {
        const a = dialogFor('<a href="#" data-href-token="payment_link">Pay</a>');
        applyLinkAttrsForTest(a, 'https://x.test', open, close);
        expect(a.hasAttribute('data-href-token')).toBe(false);
        expect(a.getAttribute('href')).toBe('https://x.test');
    });

    it('shows the variable when the link is edited, so a round trip keeps it', () => {
        const a = dialogFor('<a href="#" data-href-token="payment_link">Pay</a>');
        expect(displayUrlForTest(a, open, close)).toBe('{{payment_link}}');
    });

    it('shows a real address unchanged', () => {
        const a = dialogFor('<a href="https://x.test">Pay</a>');
        expect(displayUrlForTest(a, open, close)).toBe('https://x.test');
    });
});

describe('a variable pasted into the URL field', () => {
    // Text that merely LOOKS like a variable passes the URL shape check, so
    // without a membership test a token chip's human label — the one thing an
    // author can actually copy out of the body — would be stored as a
    // destination nothing can resolve, and the link would silently go nowhere.
    it('is shaped like a valid URL, which is exactly the trap', () => {
        expect(isValidLinkUrl('{{Admission Fee, Link 1: Payment page}}', '{{', '}}')).toBe(true);
    });

    it('and is therefore only safe if the dialog checks it against the picker list', () => {
        const known = [{ key: 'Fee:abc:link-1:PaymentGatewayLink', label: 'Admission Fee, Link 1: Payment page' }];
        const pasted = 'Admission Fee, Link 1: Payment page';
        // The label is what an author sees and copies; the key is what resolves.
        expect(known.some((t) => t.key === pasted)).toBe(false);
        expect(known.some((t) => t.label === pasted)).toBe(true);
    });
});

describe('pasting a variable into the URL field', () => {
    // What a token chip shows in the body is its LABEL, so that is what an
    // author can select and copy. Refusing it would be technically correct and
    // useless, so both forms are accepted and the key is what gets stored.
    const tokens = [
        { key: 'Fee:abc:link-1:PaymentGatewayLink', label: 'Admission Fee, Link 1: Payment page' },
        { key: 'first_name', label: 'First Name' }
    ];

    it('accepts the key', () => {
        expect(resolveTokenReference('Fee:abc:link-1:PaymentGatewayLink', tokens))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('accepts the label an author can actually see and copy', () => {
        expect(resolveTokenReference('Admission Fee, Link 1: Payment page', tokens))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('survives the whitespace a copy out of rendered html picks up', () => {
        expect(resolveTokenReference('  Admission Fee, Link 1:  Payment page ', tokens))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('is case insensitive, because a label is prose', () => {
        expect(resolveTokenReference('admission fee, link 1: payment page', tokens))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('refuses something that matches neither', () => {
        expect(resolveTokenReference('Some Other Fee, Link 9: Payment page', tokens)).toBeNull();
        expect(resolveTokenReference('', tokens)).toBeNull();
    });

    it('refuses an ambiguous label rather than guessing which link it meant', () => {
        const ambiguous = [
            { key: 'Fee:a:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' },
            { key: 'Fee:b:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' }
        ];
        expect(resolveTokenReference('Fee, Link 1: Payment link', ambiguous)).toBeNull();
    });
});

describe('variables accepted but not listed', () => {
    // What a picker SHOWS and what the field ACCEPTS are different questions.
    // A generated or context-dependent set is noise in a flat dropdown, but an
    // author who copies one out of the document must still be able to paste it.
    const shown = [{ key: 'first_name', label: 'First Name' }];
    const unlisted = [{ key: 'Fee:abc:link-1:PaymentGatewayLink', label: 'Admission Fee, Link 1: Payment page' }];

    it('resolves an unlisted variable by key', () => {
        expect(resolveTokenReference('Fee:abc:link-1:PaymentGatewayLink', [...shown, ...unlisted]))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('resolves an unlisted variable by the label an author can copy', () => {
        expect(resolveTokenReference('Admission Fee, Link 1: Payment page', [...shown, ...unlisted]))
            .toBe('Fee:abc:link-1:PaymentGatewayLink');
    });

    it('still refuses one that is in neither list', () => {
        expect(resolveTokenReference('Hostel Fee, Link 1: Payment page', [...shown, ...unlisted])).toBeNull();
    });
});
