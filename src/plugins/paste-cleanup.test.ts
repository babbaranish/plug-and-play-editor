import { describe, it, expect } from 'vitest';
import { cleanHtml } from './paste-cleanup';
import type { Typography } from './paste-cleanup';

// The typography at the paste point: this editor's own defaults.
const CTX: Typography = {
    'font-family': 'Inter, sans-serif', 'font-size': '15px', 'font-weight': '400', 'font-style': 'normal',
    color: 'rgb(30, 41, 59)', 'line-height': 'normal', 'text-align': 'start', background: 'rgb(255, 255, 255)'
};

describe('cleanHtml keeps the author’s typography', () => {
    it('keeps a font family and size that differ from the paste point', () => {
        const out = cleanHtml('<span style="font-family: Georgia, serif;"><span style="font-size: 24px;">Hi</span></span>', CTX);
        expect(out).toContain('font-family: Georgia, serif');
        expect(out).toContain('font-size: 24px');
    });

    it('turns this editor’s own <font color/face/size> into styled spans instead of dropping them', () => {
        const out = cleanHtml('<font color="rgb(220, 38, 38)" face="Georgia" size="5">Hi</font>', CTX);
        expect(out).not.toContain('<font');
        expect(out).toContain('color: rgb(220, 38, 38)');
        expect(out).toContain('font-family: Georgia');
        expect(out).toContain('font-size: 24px');
    });

    it('drops clipboard noise that only restates the paste point, and the empty span it leaves', () => {
        const noise = '<span style="color: rgb(30, 41, 59); font-family: Inter, sans-serif; font-size: 15px; font-weight: 400; background-color: rgb(255, 255, 255); orphans: 2; white-space: normal;">plain</span>';
        expect(cleanHtml(noise, CTX)).toBe('plain');
    });

    it('does not drop a nested value just because it matches the paste point', () => {
        // Inner resets to 15px inside a 24px parent: dropping it would make the text 24px.
        const out = cleanHtml('<span style="font-size: 24px">big <span style="font-size: 15px">small</span></span>', CTX);
        expect(out).toContain('font-size: 15px');
    });

    it('still strips junk: mso properties, classes, scripts, comments', () => {
        const out = cleanHtml('<p class="MsoNormal" style="mso-line-height-rule: exactly; margin: 0">a<!-- c --><script>x()</script></p>', CTX);
        expect(out).toBe('<p>a</p>');
    });

    it('keeps a link’s destination token and colour', () => {
        const out = cleanHtml('<a href="#" data-href-token="payment_link" style="color: rgb(220, 38, 38)" onclick="x()">Pay</a>', CTX);
        expect(out).toContain('data-href-token="payment_link"');
        expect(out).toContain('color: rgb(220, 38, 38)');
        expect(out).not.toContain('onclick');
    });
});
