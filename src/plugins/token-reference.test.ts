import { describe, it, expect } from 'vitest';
import {
    resolveTokenReference,
    tokenReferenceMatches,
    normalizeTokenHref,
    tokenDisplayText,
    tokenUrlHint,
    canonicalHrefToken,
    displayUrlForTest
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
