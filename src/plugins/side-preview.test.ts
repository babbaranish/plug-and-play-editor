import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import { buildPreviewHtml, createSidePreviewPlugin, SidePreviewPlugin, SIDE_PREVIEW_TOGGLE_COMMAND } from './side-preview';
import { SourceCodePlugin } from './source-code';
import { PreviewPlugin } from './preview';
import type { Plugin } from '../core/Plugin';
import { toAmpEmail } from '../amp';
import { renderAmpFormBlock } from '../amp/forms/formRenderer';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [SidePreviewPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const fragment = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
};

describe('buildPreviewHtml', () => {
    const data = { first_name: 'Alice', pay_link: 'https://pay.test/abc' };

    it('replaces a variable chip with its sample value as plain text', () => {
        const out = buildPreviewHtml('<p>Hi <span class="play-editor-token" contenteditable="false" data-token="first_name">{{first_name}}</span>!</p>', data);
        expect(out).toBe('<p>Hi Alice!</p>');
    });

    it('keeps the chip text when there is no sample value', () => {
        const out = buildPreviewHtml('<p><span class="play-editor-token" data-token="unknown">{{unknown}}</span></p>', data);
        expect(out).toBe('<p>{{unknown}}</p>');
    });

    it('fills placeholders typed as text and inside attributes', () => {
        const out = fragment(buildPreviewHtml('<p title="for {{first_name}}">Dear {{ first_name }}, {{missing}}</p>', data));
        const p = out.querySelector('p')!;
        expect(p.textContent).toBe('Dear Alice, {{missing}}');
        expect(p.getAttribute('title')).toBe('for Alice');
    });

    it('gives a destination behind an inert href its sample address', () => {
        const out = fragment(buildPreviewHtml('<a href="#" data-href-token="pay_link">Pay</a>', data));
        expect(out.querySelector('a')!.getAttribute('href')).toBe('https://pay.test/abc');
    });

    it('leaves a real href alone even when data-href-token is set', () => {
        const out = fragment(buildPreviewHtml('<a href="https://x.test/" data-href-token="pay_link">Pay</a>', data));
        expect(out.querySelector('a')!.getAttribute('href')).toBe('https://x.test/');
    });

    it('drops the editor\'s contenteditable markers', () => {
        const out = buildPreviewHtml('<div class="play-editor-button-block" contenteditable="false"><a href="https://x.test/">Go</a></div>', data);
        expect(out).not.toContain('contenteditable');
        expect(out).toContain('play-editor-button-block');
    });
});

describe('SidePreviewPlugin layout', () => {
    it('puts the editing area and the preview side by side, open by default', () => {
        const ed = mount('<p>Hello</p>');
        const split = ed.container.querySelector('.play-editor-split')!;
        expect(split).not.toBeNull();
        expect(ed.editorArea.parentElement!.classList.contains('play-editor-split-main')).toBe(true);
        expect(split.querySelector('.play-editor-side-preview iframe')).not.toBeNull();
        expect(ed.container.classList.contains('play-editor-side-preview-open')).toBe(true);
        // Content is untouched by the wrapping.
        expect(ed.getContent()).toBe('<p>Hello</p>');
    });

    it('starts closed when asked, and toggles from the toolbar and the command', () => {
        const ed = mount('<p>x</p>', [createSidePreviewPlugin({ open: false })]);
        expect(ed.container.classList.contains('play-editor-side-preview-open')).toBe(false);

        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Side Preview"]')!.click();
        expect(ed.container.classList.contains('play-editor-side-preview-open')).toBe(true);

        expect(ed.runCommand<boolean>(SIDE_PREVIEW_TOGGLE_COMMAND)).toBe(false);
        expect(ed.container.classList.contains('play-editor-side-preview-open')).toBe(false);
    });

    it('closes from the pane header', () => {
        const ed = mount('<p>x</p>');
        ed.container.querySelector<HTMLButtonElement>('button[title="Close preview"]')!.click();
        expect(ed.container.classList.contains('play-editor-side-preview-open')).toBe(false);
    });

    it('switches the preview width between desktop and mobile', () => {
        const ed = mount('<p>x</p>');
        const stage = ed.container.querySelector('.play-editor-side-preview-stage')!;
        const mobile = ed.container.querySelector<HTMLButtonElement>('button[title^="Mobile width"]')!;
        mobile.click();
        expect(stage.classList.contains('play-editor-side-preview-mobile')).toBe(true);
        expect(mobile.getAttribute('aria-pressed')).toBe('true');
        ed.container.querySelector<HTMLButtonElement>('button[title="Desktop width"]')!.click();
        expect(stage.classList.contains('play-editor-side-preview-mobile')).toBe(false);
    });

    it('opens the source view in the editing column, beside the preview', () => {
        const ed = mount('<p>x</p>', [SidePreviewPlugin, SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        const textarea = ed.container.querySelector('.play-editor-source-textarea')!;
        expect(textarea.closest('.play-editor-split-main')).not.toBeNull();
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        expect(ed.container.querySelector('.play-editor-source-textarea')).toBeNull();
        expect(ed.getContent()).toBe('<p>x</p>');
    });

    it('lets Preview Mode open and close with the editing area wrapped', () => {
        const ed = mount('<p>x</p>', [SidePreviewPlugin, PreviewPlugin]);
        const btn = ed.toolbar.querySelector<HTMLButtonElement>('button[title="Preview Mode"]')!;
        btn.click();
        const exit = ed.container.querySelector('.play-editor-preview-exit')!;
        expect(exit.nextElementSibling).toBe(ed.editorArea);
        btn.click();
        expect(ed.container.querySelector('.play-editor-preview-exit')).toBeNull();
    });

    it('gives the textarea back on destroy', () => {
        const ed = mount('<p>x</p>');
        const ta = ed.textArea;
        ed.destroy();
        editors.splice(editors.indexOf(ed), 1);
        expect(ta.style.display).toBe('');
        expect(document.querySelector('.play-editor-split')).toBeNull();
    });
});

describe('SidePreviewPlugin AMP status', () => {
    const ampPlugin = (over: Parameters<typeof createSidePreviewPlugin>[0] = {}) =>
        createSidePreviewPlugin({ ampConverter: (html) => toAmpEmail(html), ...over });
    const summary = (ed: Editor) => ed.container.querySelector('.play-editor-side-preview-amp-summary')!.textContent;
    const flush = () => new Promise(r => setTimeout(r, 200));

    const modeBtn = (ed: Editor, label: 'AMP email' | 'HTML email') =>
        Array.from(ed.container.querySelectorAll<HTMLButtonElement>('.play-editor-side-preview-mode')).find(b => b.textContent === label)!;
    const pane = (ed: Editor) => ed.container.querySelector('.play-editor-side-preview')!;

    it('switches between the AMP email and HTML email versions in one preview', () => {
        const ed = mount('<p>Hello</p>', [ampPlugin()]);
        expect(ed.container.querySelectorAll('.play-editor-side-preview iframe').length).toBe(1);
        // Starts on the AMP version, with its status line.
        expect(modeBtn(ed, 'AMP email').getAttribute('aria-pressed')).toBe('true');
        expect(pane(ed).classList.contains('play-editor-side-preview-html-mode')).toBe(false);
        expect(summary(ed)).toBe('AMP: ready');

        modeBtn(ed, 'HTML email').click();
        expect(modeBtn(ed, 'HTML email').getAttribute('aria-pressed')).toBe('true');
        expect(modeBtn(ed, 'AMP email').getAttribute('aria-pressed')).toBe('false');
        expect(pane(ed).classList.contains('play-editor-side-preview-html-mode')).toBe(true);
        expect(ed.container.querySelector('.play-editor-side-preview-frame')!.getAttribute('title')).toBe('HTML email preview');

        modeBtn(ed, 'AMP email').click();
        expect(pane(ed).classList.contains('play-editor-side-preview-html-mode')).toBe(false);
    });

    it('can start on the HTML version', () => {
        const ed = mount('<p>Hello</p>', [ampPlugin({ mode: 'html' })]);
        expect(modeBtn(ed, 'HTML email').getAttribute('aria-pressed')).toBe('true');
    });

    it('has no switch without a converter: only the HTML version exists', () => {
        const ed = mount('<p>Hello</p>', [createSidePreviewPlugin({ mode: 'amp' })]);
        expect(ed.container.querySelector('.play-editor-side-preview-modes')).toBeNull();
        expect(pane(ed).classList.contains('play-editor-side-preview-html-mode')).toBe(true);
    });

    it('has no AMP status without a converter', () => {
        const ed = mount('<p>x</p>');
        expect(ed.container.querySelector('.play-editor-side-preview-amp-bar')).toBeNull();
    });

    it('lists what to fix and what was changed automatically', () => {
        const ed = mount('<p><a href="#">Pay</a> <a href="#toc-1">Intro</a></p>', [ampPlugin()]);
        expect(summary(ed)).toBe('AMP: 1 problem to fix');
        const items = Array.from(ed.container.querySelectorAll('.play-editor-side-preview-amp-issue'));
        expect(items.map(li => li.querySelector('strong')!.textContent)).toEqual(['Fix', 'Changed']);
        // The snippet is shown as text, not markup.
        expect(items[0].querySelector('code')!.textContent).toContain('<a href="#"');
        expect(items[0].querySelector('code a')).toBeNull();
    });

    it('follows HTML typed in the source view', async () => {
        const ed = mount('<p>x</p>', [ampPlugin(), SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        const textarea = ed.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea')!;
        textarea.value = '<p><img src="https://cdn.test/a.png"></p>';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();
        expect(summary(ed)).toBe('AMP: 1 problem to fix');
        expect(ed.container.querySelector('.play-editor-side-preview-amp-issue')!.textContent).toContain('width and a height');

        textarea.value = '<p><img src="https://cdn.test/a.png" width="300" height="100"></p>';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();
        expect(summary(ed)).toBe('AMP: ready');
    });

    it('copies the AMP version with variables left for the sender', async () => {
        const ed = mount('<p>Hi <span class="play-editor-token" data-token="first_name">{{first_name}}</span></p>', [ampPlugin({ sampleData: { first_name: 'Alice' } })]);
        let copied = '';
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied = t; } } });
        ed.container.querySelector<HTMLButtonElement>('.play-editor-side-preview-amp-copy')!.click();
        await Promise.resolve();
        expect(copied).toContain('<html ⚡4email data-css-strict>');
        expect(copied).toContain('Hi {{first_name}}');
        expect(copied).not.toContain('Alice');
    });

    it('reports a converter that throws instead of breaking the editor', () => {
        const ed = mount('<p>x</p>', [createSidePreviewPlugin({ ampConverter: () => { throw new Error('boom'); } })]);
        expect(summary(ed)).toBe('AMP: conversion failed (boom)');
    });
});

describe('AMP forms in the preview', () => {
    const block = (over: Record<string, unknown> = {}) => renderAmpFormBlock({
        action: 'https://example.com/api/subscribe',
        fields: [
            { name: 'email', type: 'email', label: 'Email address', required: true },
            { name: 'plan', type: 'select', label: 'Plan', options: ['Basic', 'Pro'] },
        ],
        submitText: 'Subscribe',
        successMessage: 'Thanks {{first_name}}!',
        ...over,
    } as never, document).outerHTML;
    const preview = (html: string, data: Record<string, string> = {}, version: 'amp' | 'html' = 'amp') => {
        const div = document.createElement('div');
        div.innerHTML = buildPreviewHtml(`<p>Hi</p>${html}`, data, { version });
        return div;
    };

    it('draws the form, as AMP email apps show it', () => {
        const p = preview(block());
        const form = p.querySelector('form')!;
        expect(form).not.toBeNull();
        expect(Array.from(form.querySelectorAll('[name]')).map(el => el.getAttribute('name'))).toEqual(['email', 'plan']);
        expect(form.querySelector('label')!.textContent).toBe('Email address');
        expect(form.querySelector('button')!.textContent).toBe('Subscribe');
        expect(p.querySelector('.play-editor-amp-form, [data-amp-form]')).toBeNull();
    });

    it('cannot post anywhere and leaves out the state messages', () => {
        const form = preview(block()).querySelector('form')!;
        expect(form.hasAttribute('action-xhr')).toBe(false);
        expect(form.hasAttribute('action')).toBe(false);
        expect(form.querySelector('[submitting], [submit-success], [submit-error]')).toBeNull();
    });

    it('shows the fallback text and link in the HTML version', () => {
        const p = preview(block({ fallbackUrl: 'https://example.com/subscribe' }), {}, 'html');
        expect(p.querySelector('form, input')).toBeNull();
        expect(p.textContent).toContain('This email has a form you can fill in using an email app that supports interactive email, such as Gmail.');
        const link = p.querySelector('a')!;
        expect(link.getAttribute('href')).toBe('https://example.com/subscribe');
        expect(link.textContent).toBe('Subscribe');
    });

    it('shows the HTML version when no version is given', () => {
        const div = document.createElement('div');
        div.innerHTML = buildPreviewHtml(block());
        expect(div.querySelector('form')).toBeNull();
    });

    it('draws the form with no extra note in the AMP version', () => {
        expect(preview(block()).textContent).not.toContain('This email has a form');
    });

    it('fills sample values into the form text', () => {
        const p = preview(block({ fields: [{ name: 'email', type: 'email', label: 'Email for {{first_name}}' }] }), { first_name: 'Alice' });
        expect(p.querySelector('label')!.textContent).toBe('Email for Alice');
    });

    it('keeps the fallback for a form whose settings are invalid', () => {
        const p = preview(block().replace('https://example.com', 'http://example.com'));
        expect(p.querySelector('form')).toBeNull();
        expect(p.textContent).toContain('This email has a form you can fill in');
    });

    it('does not change the stored HTML', () => {
        const ed = mount(`<p>Hi</p>${block()}`, [createSidePreviewPlugin({ ampConverter: (html) => toAmpEmail(html) })]);
        expect(ed.getContent()).toContain('data-action=');
        expect(ed.getContent()).not.toContain('<form');
        expect(ed.container.querySelector('.play-editor-side-preview-amp-summary')!.textContent).toBe('AMP: ready');
    });
});
