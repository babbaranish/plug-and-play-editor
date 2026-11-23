import { describe, it, expect } from 'vitest';
import { toAmpEmail, AMP_CSS_LIMIT } from './index';
import type { AmpEmailResult, AmpTransformer } from './index';
import { generateButtonHtmlForTest } from '../plugins/button-block';

/** The converted body, parsed, for querying. */
function body(result: AmpEmailResult): HTMLDivElement {
    const m = /<body>\n([\s\S]*)\n<\/body>/.exec(result.html);
    const div = document.createElement('div');
    div.innerHTML = m ? m[1] : '';
    return div;
}

const codes = (result: AmpEmailResult, severity?: 'error' | 'warning') =>
    result.issues.filter(i => !severity || i.severity === severity).map(i => i.code);

const button = (over: Record<string, unknown> = {}) => generateButtonHtmlForTest({
    text: 'Pay now', url: 'https://pay.test/abc', paddingV: 12, paddingH: 24,
    textColor: '#ffffff', bgColor: '#d63736', borderRadius: 4, ...over,
} as Parameters<typeof generateButtonHtmlForTest>[0]);

describe('document', () => {
    it('wraps content in the AMP for Email skeleton', () => {
        const r = toAmpEmail('<p>Hello</p>');
        expect(r.html.startsWith('<!doctype html>\n<html ⚡4email data-css-strict>')).toBe(true);
        expect(r.html).toContain('<meta charset="utf-8">');
        expect(r.html).toContain('<script async src="https://cdn.ampproject.org/v0.js"></script>');
        expect(r.html).toContain('<style amp4email-boilerplate>body{visibility:hidden}</style>');
        expect(r.html).not.toContain('amp-custom');
        expect(body(r).innerHTML).toBe('<p>Hello</p>');
        expect(r.valid).toBe(true);
        expect(r.issues).toEqual([]);
    });

    it('puts the given CSS in <style amp-custom> and cannot be closed early', () => {
        const r = toAmpEmail('<p>x</p>', { css: 'p{color:red}</style><script>x</script>' });
        expect(r.html).toContain('<style amp-custom>p{color:red}<\\/style><script>x</script></style>');
        expect(r.css.stylesheetBytes).toBeGreaterThan(0);
    });

    it('loads an extension only when the content uses it', () => {
        expect(toAmpEmail('<p>x</p>').extensions).toEqual([]);
        const r = toAmpEmail('<details><summary>Q</summary><p>A</p></details>');
        expect(r.extensions).toEqual(['amp-accordion']);
        expect(r.html).toContain('<script async custom-element="amp-accordion" src="https://cdn.ampproject.org/v0/amp-accordion-0.1.js"></script>');
    });
});

describe('images', () => {
    it('turns a resized image into an intrinsic amp-img with its size', () => {
        const r = toAmpEmail('<p><img src="https://cdn.test/a.png" alt="Logo" style="max-width: 100%; width: 240px; height: 120px; border-radius: 6px;"></p>');
        const img = body(r).querySelector('amp-img')!;
        expect(img.getAttribute('src')).toBe('https://cdn.test/a.png');
        expect(img.getAttribute('alt')).toBe('Logo');
        expect(img.getAttribute('width')).toBe('240');
        expect(img.getAttribute('height')).toBe('120');
        expect(img.getAttribute('layout')).toBe('intrinsic');
        expect(img.getAttribute('style')).toBe('border-radius: 6px');
        expect(r.valid).toBe(true);
    });

    it('reads width and height attributes', () => {
        const img = body(toAmpEmail('<img src="https://cdn.test/a.png" width="300" height="200">')).querySelector('amp-img')!;
        expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['300', '200']);
    });

    it('reports an image whose size is unknown', () => {
        const r = toAmpEmail('<img src="https://cdn.test/a.png" style="max-width:100%;height:auto">');
        expect(r.valid).toBe(false);
        expect(codes(r, 'error')).toContain('image-missing-size');
    });

    it('asks getImageSize, and keeps the aspect ratio when only a width is set', () => {
        const lookup = () => ({ width: 800, height: 400 });
        const full = body(toAmpEmail('<img src="https://cdn.test/a.png">', { getImageSize: lookup })).querySelector('amp-img')!;
        expect([full.getAttribute('width'), full.getAttribute('height')]).toEqual(['800', '400']);
        const half = body(toAmpEmail('<img src="https://cdn.test/a.png" style="width:300px">', { getImageSize: lookup })).querySelector('amp-img')!;
        expect([half.getAttribute('width'), half.getAttribute('height')]).toEqual(['300', '150']);
    });

    it('reports an uploaded (data:) image and a non-https one', () => {
        const data = toAmpEmail('<img src="data:image/png;base64,AAAA" width="10" height="10">');
        expect(data.issues.find(i => i.code === 'image-invalid-src')!.message).toContain('data: URL');
        const http = toAmpEmail('<img src="http://cdn.test/a.png" width="10" height="10">');
        expect(codes(http, 'error')).toEqual(['image-invalid-src']);
    });

    it('reads sizes written with px', () => {
        const r = toAmpEmail(`<img src="https://cdn.test/a.png" width="300px" height='100px'>`);
        const img = body(r).querySelector('amp-img')!;
        expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['300', '100']);
        expect(r.valid).toBe(true);
    });

    it('names a missing closing quote on src instead of reporting a missing size', () => {
        const r = toAmpEmail(`<img src="https://cdn.test/a.png?x=1&s=10 \nwidth="300px" height='100px'>`);
        expect(r.issues.map(i => i.code)).toEqual(['image-invalid-src']);
        expect(r.issues[0].message).toContain('missing its closing quote');
        expect(r.issues[0].message).toContain('"width"');
    });

    it('accepts a variable as the image source', () => {
        expect(toAmpEmail('<img src="{{logo_url}}" width="10" height="10">').valid).toBe(true);
    });
});

describe('buttons', () => {
    it('keeps an ordinary button as styled link', () => {
        const r = toAmpEmail(button());
        const div = body(r).firstElementChild!;
        expect(div.tagName).toBe('DIV');
        expect(div.hasAttribute('contenteditable')).toBe(false);
        expect(div.hasAttribute('class')).toBe(false);
        expect(div.getAttribute('style')).toContain('text-align: center');
        const a = div.querySelector('a')!;
        expect(a.getAttribute('href')).toBe('https://pay.test/abc');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('style')).toContain('background-color: #d63736');
        expect(r.valid).toBe(true);
    });

    it('moves a payment link from data-href-token into the href as a variable', () => {
        const r = toAmpEmail(button({ hrefToken: 'Fee:abc:link-1:PaymentLink' }));
        const a = body(r).querySelector('a')!;
        expect(a.getAttribute('href')).toBe('{{Fee:abc:link-1:PaymentLink}}');
        expect(a.hasAttribute('data-href-token')).toBe(false);
        expect(r.valid).toBe(true);
    });

    it('uses the configured delimiters for the variable', () => {
        const r = toAmpEmail(button({ hrefToken: 'pay' }), { tokenDelimiters: ['%', '%'] });
        expect(body(r).querySelector('a')!.getAttribute('href')).toBe('%pay%');
        expect(r.valid).toBe(true);
    });

    it('reports a button with no destination', () => {
        const r = toAmpEmail(button({ url: '#' }));
        expect(codes(r, 'error')).toEqual(['missing-destination']);
    });
});

describe('links', () => {
    it('keeps absolute, mailto, tel and variable links, opening in a new window', () => {
        const r = toAmpEmail('<p><a href="https://x.test/">a</a> <a href="mailto:a@x.test">b</a> <a href="tel:+100">c</a> <a href="{{site}}">d</a></p>');
        const links = Array.from(body(r).querySelectorAll('a'));
        expect(links.map(a => a.getAttribute('href'))).toEqual(['https://x.test/', 'mailto:a@x.test', 'tel:+100', '{{site}}']);
        expect(links.every(a => a.getAttribute('target') === '_blank')).toBe(true);
        expect(r.valid).toBe(true);
    });

    it('gives a destination link its variable', () => {
        const a = body(toAmpEmail('<a href="{{pay}}" data-href-token="pay">Pay</a>')).querySelector('a')!;
        expect(a.getAttribute('href')).toBe('{{pay}}');
        expect(a.hasAttribute('data-href-token')).toBe(false);
    });

    it('unwraps in-page (TOC), relative and script links, keeping their text', () => {
        const r = toAmpEmail('<ul><li><a href="#toc-heading-1">Intro</a></li></ul><p><a href="/about">About</a> <a href="javascript:alert(1)">x</a></p>');
        const b = body(r);
        expect(b.querySelectorAll('a').length).toBe(0);
        expect(b.textContent).toContain('Intro');
        expect(b.textContent).toContain('About');
        expect(codes(r, 'warning')).toEqual(['link-in-page-removed', 'link-relative-removed', 'link-unsafe-removed']);
        expect(r.valid).toBe(true);
    });

    it('reports a text link with only #', () => {
        expect(codes(toAmpEmail('<a href="#">x</a>'), 'error')).toEqual(['missing-destination']);
    });
});

describe('accordions', () => {
    const accordion = (open = true) => `
        <details class="play-editor-accordion"${open ? ' open' : ''}>
            <summary class="play-editor-accordion-title">Click to expand</summary>
            <div class="play-editor-accordion-content"><p>Accordion content</p></div>
        </details>`;

    it('turns the editor accordion into amp-accordion', () => {
        const r = toAmpEmail(accordion());
        const acc = body(r).querySelector('amp-accordion')!;
        expect(acc).not.toBeNull();
        const section = acc.querySelector('section')!;
        expect(section.hasAttribute('expanded')).toBe(true);
        expect(section.children.length).toBe(2);
        expect(section.children[0].tagName).toBe('H4');
        expect(section.children[0].textContent).toBe('Click to expand');
        expect(section.children[1].innerHTML).toBe('<p>Accordion content</p>');
        expect(body(r).querySelector('details, summary')).toBeNull();
        expect(r.valid).toBe(true);
    });

    it('joins adjacent details into one accordion and keeps closed ones collapsed', () => {
        const r = toAmpEmail(accordion() + accordion(false));
        const accs = body(r).querySelectorAll('amp-accordion');
        expect(accs.length).toBe(1);
        const sections = accs[0].querySelectorAll('section');
        expect(sections.length).toBe(2);
        expect(sections[1].hasAttribute('expanded')).toBe(false);
    });

    it('wraps loose content in one content element', () => {
        const section = body(toAmpEmail('<details><summary>Q</summary><p>A</p><p>B</p></details>')).querySelector('section')!;
        expect(section.children.length).toBe(2);
        expect(section.children[1].querySelectorAll('p').length).toBe(2);
    });
});

describe('embeds', () => {
    it('replaces a YouTube embed with its linked thumbnail', () => {
        const r = toAmpEmail('<div class="play-editor-media-wrapper"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe></div>');
        const b = body(r);
        expect(b.querySelector('iframe')).toBeNull();
        const a = b.querySelector('a')!;
        expect(a.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        const img = a.querySelector('amp-img')!;
        expect(img.getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['480', '360']);
        expect(codes(r, 'warning')).toEqual(['embed-replaced']);
        expect(r.valid).toBe(true);
    });

    it('replaces another embed with a link to it', () => {
        const r = toAmpEmail('<div class="play-editor-media-wrapper"><iframe src="https://player.vimeo.com/video/1"></iframe></div>');
        const a = body(r).querySelector('a')!;
        expect(a.getAttribute('href')).toBe('https://player.vimeo.com/video/1');
        expect(a.textContent).toBe('Watch the video');
        expect(r.valid).toBe(true);
    });
});

describe('elements', () => {
    it('removes page breaks and turns variable chips and mentions into text', () => {
        const r = toAmpEmail(
            '<p>Hi <span class="play-editor-token" contenteditable="false" data-token="first_name">{{first_name}}</span>' +
            ' and <span class="play-editor-mention" contenteditable="false" data-user-id="7">@Bob</span></p>' +
            '<div class="play-editor-page-break" contenteditable="false"><span>Page Break</span></div>'
        );
        expect(body(r).innerHTML).toBe('<p>Hi {{first_name}} and @Bob</p>');
        expect(codes(r)).toEqual(['element-removed']);
        expect(r.valid).toBe(true);
    });

    it('rewrites legacy formatting tags into allowed ones', () => {
        const r = toAmpEmail('<p><font color="#ff0000" face="Georgia" size="5">a</font><strike>b</strike><big>c</big><time datetime="2026-01-01">d</time></p><center>e</center>');
        const b = body(r);
        const span = b.querySelector('p > span')!;
        expect(span.getAttribute('style')).toBe('color: #ff0000; font-family: Georgia; font-size: 24px');
        expect(b.querySelector('s')!.textContent).toBe('b');
        expect(b.querySelector('font, strike, big, time, center')).toBeNull();
        expect(b.lastElementChild!.getAttribute('style')).toBe('text-align: center');
        expect(r.valid).toBe(true);
    });

    it('removes dangerous elements and unwraps unknown ones', () => {
        const r = toAmpEmail('<p>a<script>alert(1)</script><marquee>b</marquee></p><form><input></form>');
        expect(body(r).innerHTML).toBe('<p>ab</p>');
        expect(codes(r, 'warning')).toEqual(['element-removed', 'element-unwrapped', 'element-removed']);
        expect(r.valid).toBe(true);
    });

    it('keeps only allowed attributes', () => {
        const r = toAmpEmail('<p align="center" onclick="x()" data-x="1" class="play-editor-x keep" spellcheck="false">a</p><table cellpadding="4" width="100%"><tbody><tr><td valign="top" colspan="2">x</td></tr></tbody></table>');
        const b = body(r);
        const p = b.querySelector('p')!;
        expect(p.getAttribute('style')).toBe('text-align: center');
        expect(p.getAttribute('class')).toBe('keep');
        expect(['onclick', 'data-x', 'spellcheck', 'align'].some(a => p.hasAttribute(a))).toBe(false);
        expect(b.querySelector('table')!.getAttribute('cellpadding')).toBe('4');
        expect(b.querySelector('td')!.getAttribute('colspan')).toBe('2');
        expect(codes(r, 'warning')).toEqual(['attribute-removed']);
        expect(r.valid).toBe(true);
    });

    it('strips !important and unsafe declarations from inline styles', () => {
        const r = toAmpEmail('<p style="color: red !important; width: expression(alert(1)); margin: 0">a</p>');
        expect(body(r).querySelector('p')!.getAttribute('style')).toBe('color: red; margin: 0');
        expect(codes(r, 'warning').sort()).toEqual(['css-important-removed', 'css-unsafe-removed']);
        expect(r.valid).toBe(true);
    });

    it('keeps a semicolon inside url() as part of the value', () => {
        const r = toAmpEmail('<div style="background-image: url(data:image/png;base64,AAAA); color: red">a</div>');
        expect(body(r).querySelector('div')!.getAttribute('style')).toBe('background-image: url(data:image/png;base64,AAAA); color: red');
    });
});

describe('validation', () => {
    it('reports !important and @import in the stylesheet', () => {
        expect(codes(toAmpEmail('<p>x</p>', { css: 'p{color:red !important}' }), 'error')).toEqual(['css-important']);
        expect(codes(toAmpEmail('<p>x</p>', { css: '@import url(https://x.test/a.css);' }), 'error')).toEqual(['css-unsafe']);
    });

    it('reports CSS over the size limit, counting inline styles', () => {
        const r = toAmpEmail(`<p style="color: red">x</p>`, { css: `p{margin:0}${' '.repeat(AMP_CSS_LIMIT)}` });
        expect(codes(r, 'error')).toEqual(['css-too-large']);
        expect(r.css.inlineBytes).toBe('color: red'.length);
        expect(r.css.totalBytes).toBe(r.css.inlineBytes + r.css.stylesheetBytes);
    });

    it('cleans up an element a custom transformer adds that AMP email does not know', () => {
        const addWidget: AmpTransformer = (root, ctx) => {
            const widget = ctx.doc.createElement('amp-widget');
            widget.textContent = 'kept';
            root.appendChild(widget);
        };
        const r = toAmpEmail('<p>x</p>', { transformers: [addWidget] });
        expect(codes(r, 'warning')).toEqual(['element-unwrapped']);
        expect(body(r).textContent).toContain('kept');
    });

    it('validates what a custom transformer produces', () => {
        const addImage: AmpTransformer = (root, ctx) => {
            const img = ctx.doc.createElement('amp-img');
            img.setAttribute('src', 'https://cdn.test/a.png');
            root.appendChild(img);
        };
        const r = toAmpEmail('<p>x</p>', { transformers: [addImage] });
        expect(codes(r, 'error')).toEqual(['image-missing-size']);
        expect(r.valid).toBe(false);
    });

    it('runs custom transformers before the built-in ones', () => {
        const toImage: AmpTransformer = (root, ctx) => {
            root.querySelectorAll('.my-logo').forEach(el => {
                const img = ctx.doc.createElement('img');
                img.setAttribute('src', 'https://cdn.test/logo.png');
                img.setAttribute('width', '100');
                img.setAttribute('height', '40');
                el.replaceWith(img);
            });
        };
        const r = toAmpEmail('<div class="my-logo"></div>', { transformers: [toImage] });
        expect(body(r).querySelector('amp-img')).not.toBeNull();
        expect(r.valid).toBe(true);
    });

    it('gives each issue a snippet of the element', () => {
        const issue = toAmpEmail('<a href="#">Pay</a>').issues[0];
        expect(issue.snippet).toContain('<a href="#"');
    });
});

describe('a typical email', () => {
    it('converts content made with the toolbar into valid AMP', () => {
        const html = `
            <h2>Welcome, <span class="play-editor-token" contenteditable="false" data-token="first_name">{{first_name}}</span></h2>
            <p style="line-height: 1.8">Thanks for joining <strong>Acme</strong>. <a href="https://acme.test/start" target="_blank" rel="noopener noreferrer">Get started</a>.</p>
            <p><img src="https://cdn.test/hero.png" style="max-width: 100%; height: 300px; width: 600px;"></p>
            ${button({ hrefToken: 'pay_link' })}
            <table class="play-editor-table"><tbody><tr><td>Plan</td><td>Pro</td></tr></tbody></table>
            <details class="play-editor-accordion" open><summary class="play-editor-accordion-title">FAQ</summary><div class="play-editor-accordion-content"><p>Answer</p></div></details>
            <div class="play-editor-page-break" contenteditable="false"><span>Page Break</span></div>
            <p><time class="play-editor-datetime" datetime="2026-11-23T00:00:00.000Z">November 23, 2026</time></p>`;
        const r = toAmpEmail(html);
        expect(r.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(r.valid).toBe(true);
        expect(r.extensions).toEqual(['amp-accordion']);
        expect(r.html).not.toContain('play-editor-');
        expect(r.html).not.toContain('contenteditable');
        expect(r.html).not.toContain('<img');
    });
});
