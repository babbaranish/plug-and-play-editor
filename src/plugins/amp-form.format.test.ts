/**
 * The stored format of an AMP form: readable attributes on the block and one
 * empty element per field, instead of a JSON blob. Old (JSON) blocks still
 * work and move to the readable format when next saved.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpFormPlugin, addAmpForm, updateAmpForm } from './amp-form';
import { SourceCodePlugin } from './source-code';
import { cleanHtml } from './paste-cleanup';
import { buildPreviewHtml } from './side-preview';
import { readAmpFormConfig, readStoredAmpFormConfig, DEFAULT_FALLBACK_TEXT } from '../amp/forms/formConfig';
import { renderAmpFormBlock } from '../amp/forms/formRenderer';
import type { AmpFormConfig } from '../amp/forms/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html = '<p>Hello</p>', plugins: Plugin[] = [AmpFormPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const nextFrame = () => new Promise(r => setTimeout(r, 40));

const full: AmpFormConfig = {
    action: 'https://example.com/api/subscribe',
    method: 'POST',
    fields: [
        { name: 'email', type: 'email', label: 'Email Address', placeholder: 'Enter your email', required: true },
        { name: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose a plan', options: ['Basic', { label: 'Pro plan', value: 'pro' }] },
        { name: 'msg', type: 'textarea' },
    ],
    submitText: 'Subscribe',
    successMessage: 'Successfully subscribed!',
    errorMessage: 'Something went wrong!',
    submittingMessage: 'Sending',
    fallbackText: 'Open this email in Gmail to fill in the form.',
    fallbackUrl: 'https://example.com/subscribe',
};

/** A form block written by hand, as someone would in the source view. */
const handWritten = (attrs: string, fields: string) =>
    `<div class="play-editor-amp-form" contenteditable="false" ${attrs}>${fields}<p>Fallback text.</p></div>`;

function ampForm(html: string): HTMLFormElement | null {
    const m = /<body>\n([\s\S]*)\n<\/body>/.exec(toAmpEmail(html).html);
    const div = document.createElement('div');
    div.innerHTML = m ? m[1] : '';
    return div.querySelector('form');
}

describe('the readable format', () => {
    it('writes settings as attributes and one empty element per field, with no JSON', () => {
        const block = renderAmpFormBlock({
            action: 'https://example.com/api/subscribe',
            fields: [
                { name: 'email', type: 'email', label: 'Email Address', required: true },
                { name: 'plan', type: 'select', label: 'Plan', options: ['Basic', 'Pro'] },
            ],
            submitText: 'Subscribe',
        }, document);
        expect(block.outerHTML).toBe(
            '<div class="play-editor-amp-form" contenteditable="false" data-action="https://example.com/api/subscribe" data-submit-text="Subscribe"' +
            ' data-amp-form-summary="AMP form · Email Address, Plan → example.com/api/subscribe" style="margin: 1em 0">' +
            '<div data-amp-field="email" data-type="email" data-label="Email Address" data-required=""></div>' +
            '<div data-amp-field="plan" data-type="select" data-label="Plan" data-options="Basic, Pro"></div>' +
            `<p style="margin: 0 0 8px">${DEFAULT_FALLBACK_TEXT}</p>` +
            '</div>'
        );
        expect(block.outerHTML).not.toContain('&quot;');
        expect(block.hasAttribute('data-amp-form')).toBe(false);
    });

    it('reads back exactly what it wrote, choices with their values included', () => {
        expect(readStoredAmpFormConfig(renderAmpFormBlock(full, document))).toEqual(full);
    });

    it('adds nothing visible to the HTML version: the field elements are empty', () => {
        const block = renderAmpFormBlock(full, document);
        expect(Array.from(block.querySelectorAll('[data-amp-field]')).every(el => el.childNodes.length === 0)).toBe(true);
        expect(block.textContent).toBe('Open this email in Gmail to fill in the form.Subscribe');
    });
});

describe('editing the format by hand', () => {
    it('converts a hand-written form into an AMP form', () => {
        const form = ampForm(handWritten(
            'data-action="https://example.com/api/feedback" data-submit-text="Send"',
            '<div data-amp-field="comments" data-type="textarea" data-label="Comments" data-required></div>' +
            '<div data-amp-field="rating" data-type="select" data-label="Rating" data-options="Good, Bad = bad"></div>'
        ))!;
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/feedback');
        expect(form.querySelector('textarea[name="comments"][required]')).not.toBeNull();
        expect(Array.from(form.querySelectorAll('option')).map(o => [o.getAttribute('value'), o.textContent])).toEqual([['Good', 'Good'], ['bad', 'Bad']]);
        expect(form.querySelector('button')!.textContent).toBe('Send');
    });

    it('treats data-required="false" as not required', () => {
        const form = ampForm(handWritten('data-action="https://example.com/x"', '<div data-amp-field="a" data-type="text" data-required="false"></div>'))!;
        expect(form.querySelector('input')!.hasAttribute('required')).toBe(false);
    });

    it('keeps fields in the order they are written', () => {
        const form = ampForm(handWritten('data-action="https://example.com/x"',
            '<div data-amp-field="b" data-type="text"></div><div data-amp-field="a" data-type="email"></div>'))!;
        expect(Array.from(form.querySelectorAll('input')).map(i => i.name)).toEqual(['b', 'a']);
    });

    it('reports missing or wrong settings with the same messages as the API', () => {
        const r = toAmpEmail(handWritten('data-action="http://example.com/x"', '<div data-amp-field="a"></div>'));
        expect(r.valid).toBe(false);
        expect(r.issues.map(i => i.message)).toEqual([
            'Form 1: action: The endpoint "http://example.com/x" uses http. AMP email forms can only post to https.',
            'Form 1: fields[0].type: Field type must be one of text, email, number, select, textarea.',
        ]);
    });

    it('names a misspelt attribute instead of ignoring it', () => {
        const r = toAmpEmail(handWritten('data-action="https://example.com/x" data-sumbit-text="Go"',
            '<div data-amp-field="a" data-type="text" data-lable="A"></div>'));
        expect(r.issues.map(i => i.message)).toEqual([
            'Form 1: sumbitText: "sumbitText" is not a supported option.',
            'Form 1: fields[0].lable: "lable" is not a supported option.',
        ]);
    });

    it('updates the summary after an edit in the source view', async () => {
        const ed = mount('<p>Hello</p>', [AmpFormPlugin, SourceCodePlugin]);
        addAmpForm(ed, { action: 'https://example.com/api/subscribe', fields: [{ name: 'email', type: 'email', label: 'Email' }] });
        const toggle = ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!;
        toggle.click();
        const textarea = ed.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea')!;
        textarea.value = textarea.value
            .replace('data-label="Email"', 'data-label="Work email"')
            .replace('https://example.com/api/subscribe', 'https://example.com/api/v2');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        toggle.click();
        await nextFrame();
        const block = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(block.getAttribute('data-amp-form-summary')).toBe('AMP form · Work email → example.com/api/v2');
        expect(ed.getContent()).toContain('AMP form · Work email → example.com/api/v2');
    });
});

describe('forms saved in the old JSON format', () => {
    const legacyHtml = () => {
        const block = document.createElement('div');
        block.className = 'play-editor-amp-form';
        block.setAttribute('contenteditable', 'false');
        block.setAttribute('data-amp-form', JSON.stringify(full));
        block.setAttribute('data-amp-form-summary', 'AMP form · old');
        block.innerHTML = `<p>${DEFAULT_FALLBACK_TEXT}</p>`;
        return block.outerHTML;
    };

    it('still convert, preview and read', () => {
        const html = legacyHtml();
        expect(ampForm(html)!.getAttribute('action-xhr')).toBe('https://example.com/api/subscribe');
        const preview = document.createElement('div');
        preview.innerHTML = buildPreviewHtml(html, {}, { version: 'amp' });
        expect(preview.querySelector('form [name="plan"]')).not.toBeNull();
        const container = document.createElement('div');
        container.innerHTML = html;
        expect('config' in readAmpFormConfig(container.firstElementChild!)).toBe(true);
    });

    it('move to the readable format when next saved, losing nothing', () => {
        const ed = mount(`<p>Hi</p>${legacyHtml()}`);
        const block = ed.editorArea.querySelector('.play-editor-amp-form')!;
        const saved = updateAmpForm(ed, block, { submitText: 'Join' })!;
        expect(saved.hasAttribute('data-amp-form')).toBe(false);
        expect(saved.getAttribute('data-action')).toBe('https://example.com/api/subscribe');
        expect(readStoredAmpFormConfig(saved)).toEqual({ ...full, submitText: 'Join' });
    });

    it('are not rewritten just by opening the editor', () => {
        const html = `<p>Hi</p>${legacyHtml()}`;
        const ed = mount(html);
        expect(ed.editorArea.querySelector('.play-editor-amp-form')!.hasAttribute('data-amp-form')).toBe(true);
    });
});

describe('paste', () => {
    it('keeps a form block\'s settings and fields', () => {
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(renderAmpFormBlock(full, document).outerHTML);
        expect(readStoredAmpFormConfig(pasted.querySelector('.play-editor-amp-form')!)).toEqual(full);
    });

    it('drops form attributes anywhere else', () => {
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml('<div data-action="https://x.test" data-amp-field="a" data-type="text"><p data-label="x">hi</p></div>');
        expect(pasted.querySelector('[data-action], [data-amp-field], [data-type], [data-label]')).toBeNull();
    });
});
