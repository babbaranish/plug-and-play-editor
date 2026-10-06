import { describe, it, expect } from 'vitest';
import { cleanHtml } from './paste-cleanup';
import type { Typography } from './paste-cleanup';

// The typography at the paste point: this editor's own defaults.
const CTX: Typography = {
    'font-family': 'Inter, sans-serif', 'font-size': '15px', 'font-weight': '400', 'font-style': 'normal',
    color: 'rgb(30, 41, 59)', 'line-height': 'normal', 'text-align': 'start', background: 'rgb(255, 255, 255)',
    'font-variant-caps': 'normal', 'font-variant-ligatures': 'normal', 'text-indent': '0px', 'text-transform': 'none',
    'letter-spacing': 'normal', 'word-spacing': '0px', 'white-space': 'normal', orphans: '2', widows: '2'
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
        const out = cleanHtml('<p class="MsoNormal" style="mso-line-height-rule: exactly; position: absolute">a<!-- c --><script>x()</script></p>', CTX);
        expect(out).toBe('<p>a</p>');
    });

    it('keeps a link’s destination token and colour', () => {
        const out = cleanHtml('<a href="#" data-href-token="payment_link" style="color: rgb(220, 38, 38)" onclick="x()">Pay</a>', CTX);
        expect(out).toContain('data-href-token="payment_link"');
        expect(out).toContain('color: rgb(220, 38, 38)');
        expect(out).not.toContain('onclick');
    });
});

describe('cleanHtml keeps the template’s block spacing', () => {
    it('keeps a list’s margin and indent, and its items’ spacing', () => {
        const out = cleanHtml('<ul style="margin: 0px 0px 8px; padding-left: 15px;"><li style="margin-bottom: 4px;">a</li></ul>', CTX);
        expect(out).toContain('margin: 0px 0px 8px');
        expect(out).toContain('padding-left: 15px');
        expect(out).toContain('<li style="margin-bottom: 4px">');
    });

    it('keeps the margins on headings and paragraphs, including the spacing tool’s margin-bottom', () => {
        const out = cleanHtml('<h3 style="margin: 16px 0px 8px;">H</h3><p style="margin-bottom: 1.5em;">p</p>', CTX);
        expect(out).toContain('<h3 style="margin: 16px 0px 8px">');
        expect(out).toContain('<p style="margin-bottom: 1.5em">');
    });

    it('keeps a Google Docs list’s logical indent', () => {
        const out = cleanHtml('<ul style="margin-top: 0; margin-bottom: 0; padding-inline-start: 48px;"><li>a</li></ul>', CTX);
        expect(out).toContain('padding-inline-start: 48px');
    });


    it('drops Chrome’s interchange newline instead of pasting it as a line break', () => {
        const out = cleanHtml('<h3><br class="Apple-interchange-newline">How it works</h3>', CTX);
        expect(out).toBe('<h3>How it works</h3>');
    });
});

describe('cleanHtml pastes a ditto of email layouts', () => {
    it('keeps the editor’s button block whole: its wrapper, and the link’s padding, radius and no-underline', () => {
        const btn = '<div contenteditable="false" class="play-editor-button-block" style="margin:1em 0;text-align:center;">'
            + '<a href="https://x.test" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;color:#ffffff;'
            + 'background-color:#dc2626;border-radius:6px;text-decoration:none;font-weight:bold;">Start</a></div>';
        const out = cleanHtml(btn, CTX);
        expect(out).toMatch(/^<div [^>]*class="play-editor-button-block"/);
        expect(out).toMatch(/^<div [^>]*data-pe-non-editable=""/);
        expect(out).not.toContain('contenteditable');
        expect(out).toContain('text-align: center');
        for (const decl of ['display: inline-block', 'padding: 12px 24px', 'border-radius: 6px', 'text-decoration: none']) {
            expect(out).toContain(decl);
        }
        expect(out).toMatch(/background-color: (#dc2626|rgb\(220, 38, 38\))/);
    });

    it('keeps a link’s colour even when it matches the text around it, since links don’t inherit colour', () => {
        const out = cleanHtml('<p style="color: rgb(255, 255, 255)"><a href="https://x.test" style="color: rgb(255, 255, 255)">Visit</a></p>', CTX);
        expect(out).toContain('<a href="https://x.test" style="color: rgb(255, 255, 255)">');
    });

    it('keeps an image’s alignment, spacing and rounding', () => {
        const out = cleanHtml('<img src="https://x.test/i.png" width="16" height="16" style="vertical-align: middle; margin-right: 8px; border-radius: 6px">', CTX);
        for (const part of ['width="16"', 'height="16"', 'vertical-align: middle', 'margin-right: 8px', 'border-radius: 6px']) expect(out).toContain(part);
    });

    it('keeps table layout attributes, and drops ones whose values aren’t layout', () => {
        const out = cleanHtml('<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" align="center"><tbody><tr>'
            + '<td align="center" valign="top" colspan="2" width="expression(alert(1))" style="padding: 24px 20px">x</td></tr></tbody></table>', CTX);
        for (const part of ['width="600"', 'cellpadding="0"', 'cellspacing="0"', 'border="0"', 'bgcolor="#111111"', 'align="center"', 'valign="top"', 'colspan="2"', 'padding: 24px 20px']) {
            expect(out).toContain(part);
        }
        expect(out).not.toContain('expression');
    });

    it('keeps layout divs as divs, and the editor’s chips with what makes them chips', () => {
        expect(cleanHtml('<section style="padding: 8px"><p>a</p></section>', CTX)).toBe('<div style="padding: 8px"><p>a</p></div>');
        const chip = cleanHtml('<span class="play-editor-token x" contenteditable="false" data-token="name" onclick="x()">{{name}}</span>', CTX);
        for (const part of ['class="play-editor-token"', 'data-token="name"', 'data-pe-non-editable=""', '>{{name}}</span>']) expect(chip).toContain(part);
        expect(chip).not.toMatch(/onclick|contenteditable| x"/);
    });

    it('drops script URLs, handlers, positioning, Office styles and unsafe style values', () => {
        const out = cleanHtml('<a href="javascript:alert(1)" onmouseover="x()">a</a><img src="javascript:alert(1)">'
            + '<p style="position: fixed; z-index: 9; mso-bidi-font-size: 11pt; background-image: url(javascript:alert(1)); color: red">b</p>', CTX);
        expect(out).not.toMatch(/javascript|onmouseover|position|z-index|mso-|background-image/);
        expect(out).toContain('color: red');
    });

    it('keeps http(s) and inline image sources, and an https background image', () => {
        const out = cleanHtml('<img src="data:image/png;base64,AAAA"><img src="https://x.test/a.png"><td style="background-image: url(https://x.test/bg.png)">x</td>', CTX);
        expect(out).toContain('src="data:image/png;base64,AAAA"');
        expect(out).toContain('src="https://x.test/a.png"');
    });

    it('re-creates an http(s) iframe sandboxed, and drops any other', () => {
        const out = cleanHtml('<iframe src="https://www.youtube.com/embed/x" width="560" height="315" onload="x()"></iframe><iframe src="javascript:alert(1)"></iframe>', CTX);
        expect(out).toContain('sandbox=');
        expect(out).toContain('src="https://www.youtube.com/embed/x"');
        expect(out).not.toMatch(/onload|javascript/);
    });

    it('drops inline SVG and form controls', () => {
        expect(cleanHtml('<p>a<svg onload="x()"><circle r="1"></circle></svg><input value="v">b</p>', CTX)).toBe('<p>ab</p>');
    });
});

describe('cleanHtml keeps styles as written', () => {
    it('keeps shorthands such as text-decoration and border, which email clients understand', () => {
        const out = cleanHtml('<a href="https://x.test" style="text-decoration: none; border: 1px solid #ccc">a</a>', CTX);
        expect(out).toContain('text-decoration: none');
        expect(out).toContain('border: 1px solid #ccc');
        expect(out).not.toContain('text-decoration-line');
    });

    // Unknown properties and url() values are checked in a real browser: happy-dom
    // accepts any property name and rejects data: URLs in CSS.
    it('keeps !important, and drops invalid values and escapes', () => {
        const out = cleanHtml('<p style="color: red !important; width: banana; background: u\\72l(x)">a</p>', CTX);
        expect(out).toBe('<p style="color: red !important">a</p>');
    });

    it('does not split a declaration on a semicolon inside quotes', () => {
        const out = cleanHtml('<p style="font-family: \'A;B\', serif; color: red">x</p>', CTX);
        expect(out).toContain("font-family: 'A;B', serif");
        expect(out).toContain('color: red');
    });
});

describe('cleanHtml URL schemes', () => {
    it('drops script URLs however they are spelled, as browsers strip tabs, newlines and leading controls', () => {
        const hrefs = ['java&#9;script:alert(1)', 'java&#10;script:alert(1)', '&#1;javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'vbscript:x', 'data:text/html,<script>x()</script>'];
        for (const href of hrefs) {
            expect(cleanHtml(`<a href="${href}">a</a>`, CTX)).toBe('<a>a</a>');
            expect(cleanHtml(`<img src="${href}">`, CTX)).toBe('<img>');
        }
    });

    it('keeps web, mail and phone links, relative links, anchors and variables', () => {
        for (const href of ['https://x.test/a', 'http://x.test', 'mailto:a@x.test', 'tel:+911234', '/path?a=b:c', '#top', '{{login_url}}']) {
            expect(cleanHtml(`<a href="${href}">a</a>`, CTX)).toContain('href=');
        }
    });

    it('keeps inline and cid images, and no other data URL', () => {
        expect(cleanHtml('<img src="data:image/png;base64,AAAA">', CTX)).toContain('src=');
        expect(cleanHtml('<img src="cid:logo@x">', CTX)).toContain('src=');
        expect(cleanHtml('<img src="data:text/html;base64,AAAA">', CTX)).toBe('<img>');
    });
});
