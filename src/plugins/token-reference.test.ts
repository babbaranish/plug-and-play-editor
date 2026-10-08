import { describe, it, expect } from 'vitest';
import {
    resolveTokenReference,
    tokenReferenceMatches,
    normalizeTokenHref,
    tokenDisplayText,
    tokenUrlHint,
    canonicalHrefToken,
    displayUrlForTest,
    resolveEmbeddedTokens
} from './links';
import { generateButtonHtmlForTest } from './button-block';

const FEE = 'Fee:3f2a9c1e-5b7d-4e2f-9a10-6c8d2e4f1a3b:link-1:PaymentLink';
const LABEL = 'Admission Fee, Link 1: Payment link';
const FEES = [{ key: FEE, label: LABEL }];

const anchor = (html: string): HTMLAnchorElement => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector('a')!;
};

describe('resolveTokenReference counts distinct keys', () => {
    it('resolves a label when the same variable is listed twice', () => {
        expect(resolveTokenReference(LABEL, [...FEES, ...FEES])).toBe(FEE);
    });

    it('still refuses a label two different variables share', () => {
        const shared = [
            { key: 'Fee:a:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' },
            { key: 'Fee:b:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' }
        ];
        expect(resolveTokenReference('Fee, Link 1: Payment link', shared)).toBeNull();
        expect(tokenReferenceMatches('Fee, Link 1: Payment link', shared)).toEqual(['Fee:a:link-1:PaymentLink', 'Fee:b:link-1:PaymentLink']);
    });

    it('prefers a key over a label, and an exact key over a case match', () => {
        const tokens = [
            { key: 'Email', label: 'Work address' },
            { key: 'email', label: 'Email' }
        ];
        expect(resolveTokenReference('email', tokens)).toBe('email');
        expect(resolveTokenReference('Email', tokens)).toBe('Email');
    });
});

describe('normalizeTokenHref', () => {
    it('decodes encoded braces in any case, spaces and non breaking spaces', () => {
        expect(normalizeTokenHref('%7B%7BAdmission%20Fee%7D%7D')).toBe('{{Admission Fee}}');
        expect(normalizeTokenHref('%7b%7bAdmission%20Fee%7d%7d')).toBe('{{Admission Fee}}');
        expect(normalizeTokenHref('{{Admission\u00a0Fee}}')).toBe('{{Admission Fee}}');
        expect(normalizeTokenHref('%7B%7BAdmission%20Fee%2C%20Link%201%3A%20Payment%20link%7D%7D')).toBe(`{{${LABEL}}}`);
    });

    it('leaves an ordinary address alone', () => {
        expect(normalizeTokenHref('https://x.test/a?b=1')).toBe('https://x.test/a?b=1');
    });
});

describe('tokenDisplayText', () => {
    it('shows the label when it leads back to the key', () => {
        expect(tokenDisplayText(FEE, FEES, '{{', '}}')).toBe(`{{${LABEL}}}`);
    });

    it('shows the key when the label is shared, missing or holds a delimiter', () => {
        const shared = [{ key: 'a', label: 'Same' }, { key: 'b', label: 'Same' }];
        expect(tokenDisplayText('a', shared, '{{', '}}')).toBe('{{a}}');
        expect(tokenDisplayText(FEE, [], '{{', '}}')).toBe(`{{${FEE}}}`);
        expect(tokenDisplayText('pct', [{ key: 'pct', label: '50% off' }], '%', '%')).toBe('%pct%');
    });
});

describe('tokenUrlHint', () => {
    const options = { tokens: FEES, open: '{{', close: '}}', pickerHasItems: true, keepUnknownKeys: false };

    it('names what a token resolves to', () => {
        expect(tokenUrlHint(`{{${LABEL}}}`, options)).toEqual({ text: `Links to ${LABEL}`, tone: 'ok' });
        expect(tokenUrlHint(`{{${FEE}}}`, options)).toEqual({ text: `Links to ${LABEL}`, tone: 'ok' });
    });

    it('says nothing for an address or an empty field', () => {
        expect(tokenUrlHint('https://x.test', options)).toBeNull();
        expect(tokenUrlHint('', options)).toBeNull();
    });

    it('flags a token that resolves to nothing', () => {
        expect(tokenUrlHint('{{Nope}}', options)).toEqual({
            text: 'Not a known variable. Pick one from the { } list beside this field.',
            tone: 'error'
        });
        expect(tokenUrlHint('{{Nope}}', { ...options, tokens: [] })).toEqual({ text: 'No variables are available here yet.', tone: 'error' });
    });

    it('trusts the exact token the dialog was opened with', () => {
        const exact = { key: FEE, label: 'Tuition, Link 1: Payment link', display: '{{Tuition, Link 1: Payment link}}' };
        expect(tokenUrlHint('{{Tuition, Link 1: Payment link}}', { ...options, tokens: [], exact }))
            .toEqual({ text: 'Links to Tuition, Link 1: Payment link', tone: 'ok' });
    });

    it('flags a label inside an address that resolves to nothing, and names it', () => {
        expect(tokenUrlHint('https://go.example/?to={{Hostel Fee}}', options)).toEqual({
            text: '"Hostel Fee" is not a known variable. Pick one from the { } list beside this field.',
            tone: 'error'
        });
        expect(tokenUrlHint('{{Hostel Fee}}?ref=mail', { ...options, pickerHasItems: false })).toEqual({
            text: '"Hostel Fee" is not a known variable. Copy it exactly as it appears in the email body.',
            tone: 'error'
        });
        expect(tokenUrlHint('https://go.example/?to={{Hostel Fee}}', { ...options, tokens: [] })).toEqual({
            text: '"Hostel Fee" is not a known variable. No variables are available here yet.',
            tone: 'error'
        });
    });

    it('flags a shared label inside an address', () => {
        const shared = [{ key: 'a', label: 'Same Label' }, { key: 'b', label: 'Same Label' }];
        expect(tokenUrlHint('https://go.example/?to={{Same Label}}', { ...options, tokens: shared })).toEqual({
            text: '"Same Label" matches more than one variable. Pick one from the { } list beside this field.',
            tone: 'error'
        });
    });

    it('says nothing for an address whose variables resolve or are shaped like keys', () => {
        expect(tokenUrlHint(`https://go.example/?to={{${LABEL}}}`, options)).toBeNull();
        expect(tokenUrlHint('https://go.example/?to={{magic_link}}', options)).toBeNull();
    });
});

describe('resolveEmbeddedTokens', () => {
    const tokens = [...FEES, { key: 'login_url', label: 'Login Link' }];

    it('writes every variable inside an address that resolves as its key', () => {
        expect(resolveEmbeddedTokens('https://go.example/?to={{Login Link}}&fee={{admission fee, link 1: payment link}}', tokens, '{{', '}}'))
            .toEqual({ url: `https://go.example/?to={{login_url}}&fee={{${FEE}}}`, unknown: null });
        expect(resolveEmbeddedTokens('{{LOGIN_URL}}?ref=mail', tokens, '{{', '}}'))
            .toEqual({ url: '{{login_url}}?ref=mail', unknown: null });
    });

    it('keeps exact keys and unknown names shaped like keys as typed', () => {
        expect(resolveEmbeddedTokens('https://x.test/{{login_url}}/{{magic_link}}?a={{}}', tokens, '{{', '}}'))
            .toEqual({ url: 'https://x.test/{{login_url}}/{{magic_link}}?a={{}}', unknown: null });
    });

    it('names the first label that resolves to nothing', () => {
        expect(resolveEmbeddedTokens('https://x.test/?a={{Login Link}}&b={{Hostel Fee}}&c={{Other Fee}}', tokens, '{{', '}}'))
            .toEqual({ url: 'https://x.test/?a={{login_url}}&b={{Hostel Fee}}&c={{Other Fee}}', unknown: { name: 'Hostel Fee', ambiguous: false } });
    });

    it('marks a label two variables share as ambiguous', () => {
        const shared = [{ key: 'a', label: 'Same Label' }, { key: 'b', label: 'Same Label' }];
        expect(resolveEmbeddedTokens('https://x.test/?a={{Same Label}}', shared, '{{', '}}').unknown)
            .toEqual({ name: 'Same Label', ambiguous: true });
    });

    it('maps the label the dialog was opened with to its key', () => {
        const exact = { key: FEE, label: 'Tuition, Link 1: Payment link', display: '{{Tuition, Link 1: Payment link}}' };
        expect(resolveEmbeddedTokens('https://x.test/?to={{Tuition, Link 1: Payment link}}', [], '{{', '}}', exact))
            .toEqual({ url: `https://x.test/?to={{${FEE}}}`, unknown: null });
    });

    it('uses the configured delimiters', () => {
        expect(resolveEmbeddedTokens('https://x.test/?to={Login Link}', tokens, '{', '}'))
            .toEqual({ url: 'https://x.test/?to={login_url}', unknown: null });
        expect(resolveEmbeddedTokens('https://x.test/?to=%Login Link%', tokens, '%', '%'))
            .toEqual({ url: 'https://x.test/?to=%login_url%', unknown: null });
    });

    it('does not mistake percent escapes for percent delimited variables', () => {
        expect(resolveEmbeddedTokens('https://x.test/a%20b?q=hello%20world&r=%2Fpath', tokens, '%', '%'))
            .toEqual({ url: 'https://x.test/a%20b?q=hello%20world&r=%2Fpath', unknown: null });
        expect(resolveEmbeddedTokens('https://x.test/a%20b?q=hello%20world&to=%Login Link%', tokens, '%', '%'))
            .toEqual({ url: 'https://x.test/a%20b?q=hello%20world&to=%login_url%', unknown: null });
        expect(resolveEmbeddedTokens('https://x.test/?to=%Login Lnk%', tokens, '%', '%').unknown)
            .toEqual({ name: 'Login Lnk', ambiguous: false });
    });
});

describe('canonicalHrefToken', () => {
    const plan = (html: string, isDestination = (key: string) => key.startsWith('Fee:')) =>
        canonicalHrefToken(anchor(html), [...FEES, { key: 'login_url', label: 'Login Link' }], '{{', '}}', isDestination);

    it('resolves labels wherever they are stored', () => {
        expect(plan(`<a href="{{${LABEL}}}">x</a>`)).toBe(FEE);
        expect(plan('<a href="%7B%7BAdmission%20Fee,%20Link%201:%20Payment%20link%7D%7D">x</a>')).toBe(FEE);
        expect(plan(`<a href="#" data-href-token="${LABEL}">x</a>`)).toBe(FEE);
    });

    it('leaves canonical and unresolvable values alone', () => {
        expect(plan(`<a href="#" data-href-token="${FEE}">x</a>`)).toBeNull();
        expect(plan('<a href="{{login_url}}">x</a>')).toBeNull();
        expect(plan('<a href="{{Hostel Fee}}">x</a>')).toBeNull();
        expect(plan('<a href="https://x.test">x</a>')).toBeNull();
    });

    it('moves exact destination keys, listed or not', () => {
        expect(plan(`<a href="{{${FEE}}}">x</a>`)).toBe(FEE);
        expect(plan('<a href="{{Fee:abc:link-2:PaymentLink}}">x</a>')).toBe('Fee:abc:link-2:PaymentLink');
    });
});

describe('displayUrl with known variables', () => {
    it('shows the label of a stored key, and of a resolvable raw token', () => {
        expect(displayUrlForTest(anchor(`<a href="#" data-href-token="${FEE}">x</a>`), '{{', '}}', FEES)).toBe(`{{${LABEL}}}`);
        expect(displayUrlForTest(anchor(`<a href="{{${FEE}}}">x</a>`), '{{', '}}', FEES)).toBe(`{{${LABEL}}}`);
    });
});

describe('generateButtonHtml for a destination', () => {
    const cfg = (over: Record<string, unknown> = {}) => ({
        text: 'Pay now',
        url: '#',
        paddingV: 12,
        paddingH: 24,
        textColor: '#ffffff',
        bgColor: '#d63736',
        borderRadius: 4,
        ...over
    } as Parameters<typeof generateButtonHtmlForTest>[0]);

    it('writes the key to data-href-token and an inert href', () => {
        const a = anchor(generateButtonHtmlForTest(cfg({ hrefToken: FEE, url: '{{ignored}}' })));
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
    });

    it('escapes the key for a double quoted attribute', () => {
        const a = anchor(generateButtonHtmlForTest(cfg({ hrefToken: 'k" onmouseover="alert(1)' })));
        expect(a.getAttribute('onmouseover')).toBeNull();
        expect(a.getAttribute('data-href-token')).toBe('k" onmouseover="alert(1)');
    });

    it('keeps a given target and rel', () => {
        const a = anchor(generateButtonHtmlForTest(cfg({ url: 'https://x.test', target: '_self', rel: 'nofollow' })));
        expect(a.getAttribute('target')).toBe('_self');
        expect(a.getAttribute('rel')).toBe('nofollow');
    });
});
