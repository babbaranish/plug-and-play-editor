import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpFormPlugin, addAmpForm, AMP_FORM_INSERT_COMMAND } from './amp-form';
import { SourceCodePlugin } from './source-code';
import { cleanHtml } from './paste-cleanup';
import { AmpFormConfigError, readStoredAmpFormConfig } from '../amp/forms/formConfig';
import type { AmpFormConfig } from '../amp/forms/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [AmpFormPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const config: AmpFormConfig = {
    action: 'https://example.com/api/subscribe',
    fields: [{ name: 'email', type: 'email', label: 'Email Address', required: true }],
    submitText: 'Subscribe',
};

function caretIn(node: Node) {
    const range = document.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
}

describe('addAmpForm', () => {
    it('inserts a form block after the block holding the caret', () => {
        const ed = mount('<p>one</p><p>two</p>');
        caretIn(ed.editorArea.firstElementChild!.firstChild!);
        const block = addAmpForm(ed, config)!;
        expect(block).not.toBeNull();
        expect(Array.from(ed.editorArea.children).map(c => c.tagName + (c.className ? `.${c.className}` : ''))).toEqual(['P', 'DIV.play-editor-amp-form', 'P']);
        expect(ed.getContent()).toContain('data-action="https://example.com/api/subscribe"');
    });

    it('appends at the end without a caret, with a paragraph to keep typing in', () => {
        const ed = mount('<p>one</p>');
        window.getSelection()!.removeAllRanges();
        const block = addAmpForm(ed, config)!;
        expect(block.previousElementSibling!.textContent).toBe('one');
        expect(block.nextElementSibling!.outerHTML).toBe('<p><br></p>');
    });

    it('tells the host the content changed', async () => {
        const ed = mount('<p>x</p>');
        let changes = 0;
        ed.editorArea.addEventListener('input', () => changes++);
        addAmpForm(ed, config);
        expect(changes).toBe(1);
        expect(ed.textArea.value).toContain('play-editor-amp-form');
    });

    it('produces content that converts to an AMP form', () => {
        const ed = mount('<p>Join</p>');
        addAmpForm(ed, config);
        const r = toAmpEmail(ed.getContent());
        expect(r.valid).toBe(true);
        expect(r.extensions).toEqual(['amp-form']);
    });

    it('throws every config problem and inserts nothing', () => {
        const ed = mount('<p>x</p>');
        const bad = { action: 'http://x.test', fields: [{ name: 'a', type: 'password' }], onSubmit: () => undefined } as unknown as AmpFormConfig;
        expect(() => addAmpForm(ed, bad)).toThrow(AmpFormConfigError);
        try {
            addAmpForm(ed, bad);
        } catch (e) {
            expect((e as AmpFormConfigError).issues.map(i => i.path)).toEqual(['onSubmit', 'action', 'fields[0].type']);
        }
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();
    });

    it('returns null without the plugin', () => {
        const ed = mount('<p>x</p>', []);
        expect(addAmpForm(ed, config)).toBeNull();
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();
    });

    it('returns null while the source view is open', () => {
        const ed = mount('<p>x</p>', [AmpFormPlugin, SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        expect(addAmpForm(ed, config)).toBeNull();
    });

    it('is reachable as a command', () => {
        const ed = mount('<p>x</p>');
        expect(ed.hasCommand(AMP_FORM_INSERT_COMMAND)).toBe(true);
        expect(ed.runCommand(AMP_FORM_INSERT_COMMAND, config)).toBeInstanceOf(HTMLElement);
    });
});

describe('form blocks and paste', () => {
    it('keeps a pasted form block\'s settings', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpForm(ed, config)!;
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(block.outerHTML);
        const copy = pasted.querySelector('.play-editor-amp-form')!;
        expect(readStoredAmpFormConfig(copy)).toEqual(config);
        expect(copy.getAttribute('data-amp-form-summary')).toContain('Email Address');
    });

    it('drops those attributes from anything that is not a form block', () => {
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml('<p data-amp-form="{}" data-amp-form-summary="x">hi</p>');
        expect(pasted.querySelector('[data-amp-form], [data-amp-form-summary]')).toBeNull();
    });
});
