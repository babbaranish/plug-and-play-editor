/**
 * Endpoint configuration for AMP forms: each form carries its own `action`,
 * validated before anything is generated, and the converter writes it as that
 * form's `action-xhr`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpFormPlugin, addAmpForm, updateAmpForm } from './amp-form';
import { SourceCodePlugin } from './source-code';
import { AmpFormConfigError, readStoredAmpFormConfig } from '../amp/forms/formConfig';
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

const form = (action: unknown, over: Partial<AmpFormConfig> = {}): AmpFormConfig => ({
    action: action as string,
    method: 'POST',
    fields: [{ name: 'email', type: 'email', required: true }],
    submitText: 'Subscribe',
    ...over,
});

/** The AMP body of `html`, parsed. */
function ampBody(html: string): HTMLDivElement {
    const m = /<body>\n([\s\S]*)\n<\/body>/.exec(toAmpEmail(html).html);
    const div = document.createElement('div');
    div.innerHTML = m ? m[1] : '';
    return div;
}

/** The config problems addAmpForm throws for `config`, by path and message. */
function rejection(config: AmpFormConfig): { path: string; message: string }[] {
    const ed = mount();
    try {
        addAmpForm(ed, config);
    } catch (e) {
        expect(e).toBeInstanceOf(AmpFormConfigError);
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();
        return (e as AmpFormConfigError).issues.map(i => ({ path: i.path, message: i.message }));
    }
    throw new Error('expected addAmpForm to throw');
}

const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal');
const input = (ed: Editor, name: string) => modal(ed)!.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
const setValue = (ed: Editor, name: string, value: string) => {
    const el = input(ed, name);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = (ed: Editor) => modal(ed)!.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
const errorText = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-error')?.textContent ?? '';
const hintText = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-hint')?.textContent ?? '';
/** The config stored on a block, read the way the editor reads it (either format). */
const stored = (block: Element) => readStoredAmpFormConfig(block) as unknown as AmpFormConfig;
const storedAction = (block: Element) => stored(block).action;

describe('1. a form with a valid https endpoint', () => {
    it('is inserted and stores its endpoint in its own config', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        expect(storedAction(block)).toBe('https://example.com/api/subscribe');
        expect(block.getAttribute('data-amp-form-summary')).toContain('→ example.com/api/subscribe');
    });
});

describe('2. a form without an endpoint', () => {
    it.each([['missing', undefined], ['empty', ''], ['blank', '   ']])('is rejected when %s', (_, action) => {
        expect(rejection(form(action))).toEqual([
            { path: 'action', message: 'The form needs an endpoint (action): the https URL that receives submissions.' },
        ]);
    });
});

describe('3. an invalid endpoint', () => {
    it.each(['not a url', 'https://', '/api/subscribe', 'example.com/api'])('rejects "%s"', (action) => {
        expect(rejection(form(action))).toEqual([{ path: 'action', message: `The endpoint "${action.trim()}" is not a valid absolute URL.` }]);
    });

    it('rejects a scheme other than https', () => {
        expect(rejection(form('ftp://example.com/x'))[0].message).toBe('The endpoint "ftp://example.com/x" must be an https URL.');
    });

    it.each([
        '{{api_base}}/subscribe',
        'https://example.com/{{list}}',
        'https://example.com/{list}',
        'https://example.com/%list%',
        'https://example.com/[[list]]',
        '${API}/subscribe',
        'https://example.com/%7B%7Blist%7D%7D',
    ])('rejects the unresolved variable in "%s"', (action) => {
        expect(rejection(form(action))[0].message).toContain('contains an unresolved variable');
    });

    it('accepts percent-escapes and a query string', () => {
        const ed = mount();
        expect(addAmpForm(ed, form('https://example.com/api/sub%20scribe?list=news&src=email'))).not.toBeNull();
    });

    it('only allows POST', () => {
        expect(rejection(form('https://example.com/x', { method: 'GET' as 'POST' }))).toEqual([
            { path: 'method', message: 'AMP email forms are sent with POST.' },
        ]);
    });
});

describe('4. an http endpoint', () => {
    it('is rejected', () => {
        expect(rejection(form('http://example.com/api/subscribe'))).toEqual([
            { path: 'action', message: 'The endpoint "http://example.com/api/subscribe" uses http. AMP email forms can only post to https.' },
        ]);
    });
});

describe('5. two forms with different endpoints', () => {
    it('each keeps and posts to its own endpoint', () => {
        const ed = mount();
        const a = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        const b = addAmpForm(ed, form('https://example.com/api/feedback', { fields: [{ name: 'comments', type: 'textarea', label: 'Comments' }] }))!;
        // Same host: the summaries still tell them apart.
        expect(a.getAttribute('data-amp-form-summary')).toContain('example.com/api/subscribe');
        expect(b.getAttribute('data-amp-form-summary')).toContain('example.com/api/feedback');

        const forms = Array.from(ampBody(ed.getContent()).querySelectorAll('form'));
        expect(forms.map(f => f.getAttribute('action-xhr'))).toEqual(['https://example.com/api/subscribe', 'https://example.com/api/feedback']);
        expect(forms[0].querySelector('[name="email"]')).not.toBeNull();
        expect(forms[1].querySelector('[name="comments"]')).not.toBeNull();
    });

    it('has no editor-wide endpoint: each form must name its own', () => {
        const ed = mount();
        addAmpForm(ed, form('https://example.com/api/subscribe'));
        expect(() => addAmpForm(ed, { fields: [{ name: 'q', type: 'text' }] } as unknown as AmpFormConfig)).toThrow(AmpFormConfigError);
    });
});

describe('6. a template without AMP forms', () => {
    const html = '<h2>News</h2><p>Read <a href="https://example.com">more</a>.</p><table><tbody><tr><td>x</td></tr></tbody></table>';

    it('converts exactly as before: no form, no action-xhr, no amp-form script', () => {
        const r = toAmpEmail(html);
        expect(r.valid).toBe(true);
        expect(r.issues).toEqual([]);
        expect(r.extensions).toEqual([]);
        expect(r.html).not.toContain('action-xhr');
        expect(r.html).not.toContain('amp-form');
        expect(r.html).not.toContain('<form');
    });

    it('exports the same HTML with or without the form plugin', () => {
        expect(mount(html, [AmpFormPlugin]).getContent()).toBe(mount(html, []).getContent());
    });

    it('runs no form validation', () => {
        expect(toAmpEmail('<p>{{endpoint}}</p>').issues.some(i => i.code === 'form-invalid')).toBe(false);
    });
});

describe('7. re-editing a form keeps its endpoint', () => {
    it('through updateAmpForm when the endpoint is not part of the change', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        const edited = updateAmpForm(ed, block, { submitText: 'Join', fields: [{ name: 'email', type: 'email' }, { name: 'name', type: 'text' }] })!;
        expect(storedAction(edited)).toBe('https://example.com/api/subscribe');
        expect(ed.editorArea.querySelectorAll('.play-editor-amp-form').length).toBe(1);
        expect(ampBody(ed.getContent()).querySelector('form')!.getAttribute('action-xhr')).toBe('https://example.com/api/subscribe');
    });

    it('through updateAmpForm when the endpoint is the change', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        const edited = updateAmpForm(ed, block, { action: 'https://example.com/api/v2/subscribe' })!;
        expect(storedAction(edited)).toBe('https://example.com/api/v2/subscribe');
        expect(edited.getAttribute('data-amp-form-summary')).toContain('example.com/api/v2/subscribe');
    });

    it('rejects an invalid change and leaves the form as it was', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        expect(() => updateAmpForm(ed, block, { action: 'http://example.com/api/subscribe' })).toThrow(AmpFormConfigError);
        expect(block.isConnected).toBe(true);
        expect(storedAction(block)).toBe('https://example.com/api/subscribe');
    });

    it('through the edit dialog, which opens with the endpoint filled in', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        block.click();
        expect(modal(ed)).not.toBeNull();
        expect(input(ed, 'action').value).toBe('https://example.com/api/subscribe');
        setValue(ed, 'submitText', 'Join the list');
        submit(ed);
        expect(modal(ed)).toBeNull();
        const edited = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(storedAction(edited)).toBe('https://example.com/api/subscribe');
        expect(stored(edited).submitText).toBe('Join the list');
        // Fields set through the API survive a dialog edit.
        expect(stored(edited).fields).toEqual([{ name: 'email', type: 'email', required: true }]);
    });

    it('through a round trip in the source view', () => {
        const ed = mount('<p>Hello</p>', [AmpFormPlugin, SourceCodePlugin]);
        addAmpForm(ed, form('https://example.com/api/subscribe'));
        const toggle = ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!;
        toggle.click();
        const textarea = ed.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea')!;
        // Edit something else in the source, then leave it.
        textarea.value = textarea.value.replace('Hello', 'Hello there');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        toggle.click();
        expect(ed.editorArea.textContent).toContain('Hello there');
        expect(storedAction(ed.editorArea.querySelector('.play-editor-amp-form')!)).toBe('https://example.com/api/subscribe');
    });
});

describe('8. action-xhr generation', () => {
    it('writes the form\'s endpoint as action-xhr with method="post", nothing else', () => {
        const action = 'https://example.com/api/subscribe?list=news&src=email';
        const ed = mount();
        addAmpForm(ed, form(action));
        const r = toAmpEmail(ed.getContent());
        expect(r.valid).toBe(true);
        const f = ampBody(ed.getContent()).querySelector('form')!;
        expect(Array.from(f.attributes).map(a => a.name).sort()).toEqual(['action-xhr', 'method']);
        expect(f.getAttribute('method')).toBe('post');
        expect(f.getAttribute('action-xhr')).toBe(action);
        expect(r.html).toContain('action-xhr="https://example.com/api/subscribe?list=news&amp;src=email"');
        expect(f.querySelector('input[type="email"][name="email"][required]')).not.toBeNull();
        expect(f.querySelector('button[type="submit"]')!.textContent).toBe('Subscribe');
    });

    it('generates no event handlers', () => {
        const ed = mount();
        addAmpForm(ed, form('https://example.com/api/subscribe'));
        const all = Array.from(ampBody(ed.getContent()).querySelectorAll('*'));
        expect(all.some(el => Array.from(el.attributes).some(a => a.name.startsWith('on')))).toBe(false);
        expect(toAmpEmail(ed.getContent()).html).not.toMatch(/<script(?![^>]*cdn\.ampproject\.org)/);
    });

    it('does not change the editor\'s DOM while converting', () => {
        const ed = mount();
        addAmpForm(ed, form('https://example.com/api/subscribe'));
        const before = ed.editorArea.innerHTML;
        toAmpEmail(ed.getContent());
        expect(ed.editorArea.innerHTML).toBe(before);
        expect(ed.editorArea.querySelector('form')).toBeNull();
    });
});

describe('editor UI: the fields section', () => {
    const items = (ed: Editor) => Array.from(modal(ed)!.querySelectorAll<HTMLElement>('.play-editor-modal-list-item'));
    const field = (ed: Editor, i: number, name: string) => items(ed)[i].querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const setField = (ed: Editor, i: number, name: string, value: string) => {
        const el = field(ed, i, name);
        const isBox = el.getAttribute('type') === 'checkbox';
        if (isBox) el.checked = value === 'true';
        else el.value = value;
        el.dispatchEvent(new Event(isBox || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const addField = (ed: Editor) => modal(ed)!.querySelector<HTMLButtonElement>('.play-editor-modal-list-add')!.click();
    const rowHint = (ed: Editor, i: number) => items(ed)[i].querySelector<HTMLElement>('.play-editor-modal-hint')!;
    const openInsert = (ed: Editor) => ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Form"]')!.click();
    const storedFields = (ed: Editor, n = 0) => stored(ed.editorArea.querySelectorAll('.play-editor-amp-form')[n]).fields;

    it('starts a new form with one email field', () => {
        const ed = mount();
        openInsert(ed);
        expect(items(ed).length).toBe(1);
        expect([field(ed, 0, 'label').value, field(ed, 0, 'name').value, field(ed, 0, 'type').value, field(ed, 0, 'required').checked])
            .toEqual(['Email address', 'email', 'email', true]);
    });

    it('builds a form with every field type and posts them in order', () => {
        const ed = mount();
        openInsert(ed);
        setValue(ed, 'action', 'https://example.com/api/signup');
        addField(ed);
        setField(ed, 1, 'label', 'Full name');
        addField(ed);
        setField(ed, 2, 'label', 'Age');
        setField(ed, 2, 'type', 'number');
        addField(ed);
        setField(ed, 3, 'label', 'Plan');
        setField(ed, 3, 'type', 'select');
        setField(ed, 3, 'options', 'Basic, Pro = pro');
        setField(ed, 3, 'placeholder', 'Choose a plan');
        setField(ed, 3, 'required', 'true');
        addField(ed);
        setField(ed, 4, 'label', 'Message');
        setField(ed, 4, 'type', 'textarea');
        submit(ed);
        expect(modal(ed)).toBeNull();

        expect(storedFields(ed)).toEqual([
            { name: 'email', type: 'email', label: 'Email address', placeholder: 'you@example.com', required: true },
            { name: 'full_name', type: 'text', label: 'Full name' },
            { name: 'age', type: 'number', label: 'Age' },
            { name: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose a plan', required: true, options: ['Basic', { label: 'Pro', value: 'pro' }] },
            { name: 'message', type: 'textarea', label: 'Message' },
        ]);
        const f = ampBody(ed.getContent()).querySelector('form')!;
        expect(f.getAttribute('action-xhr')).toBe('https://example.com/api/signup');
        expect(Array.from(f.querySelectorAll('[name]')).map(el => `${el.tagName.toLowerCase()}:${el.getAttribute('name')}`))
            .toEqual(['input:email', 'input:full_name', 'input:age', 'select:plan', 'textarea:message']);
        expect(Array.from(f.querySelectorAll('select option')).map(o => o.getAttribute('value'))).toEqual(['', 'Basic', 'pro']);
        expect(toAmpEmail(ed.getContent()).valid).toBe(true);
    });

    it('fills the field name from the label until the name is edited by hand', () => {
        const ed = mount();
        openInsert(ed);
        addField(ed);
        setField(ed, 1, 'label', 'Phone number');
        expect(field(ed, 1, 'name').value).toBe('phone_number');
        setField(ed, 1, 'name', 'tel');
        setField(ed, 1, 'label', 'Mobile phone');
        expect(field(ed, 1, 'name').value).toBe('tel');
    });

    it('shows choices only for a dropdown', () => {
        const ed = mount();
        openInsert(ed);
        const choices = () => items(ed)[0].querySelector<HTMLElement>('[data-field="options"]')!;
        expect(choices().style.display).toBe('none');
        setField(ed, 0, 'type', 'select');
        expect(choices().style.display).toBe('');
    });

    it('flags a row as it is typed and refuses to save until it is fixed', () => {
        const ed = mount();
        openInsert(ed);
        setValue(ed, 'action', 'https://example.com/api/signup');
        addField(ed);
        setField(ed, 1, 'label', 'Email');
        expect(rowHint(ed, 1).textContent).toBe('Field name "email" is used twice.');
        addField(ed);
        setField(ed, 2, 'label', 'Plan');
        setField(ed, 2, 'type', 'select');
        expect(rowHint(ed, 2).textContent).toBe('A select field needs at least one option.');
        submit(ed);
        expect(errorText(ed)).toContain('Field 2: Field name "email" is used twice.');
        expect(errorText(ed)).toContain('Field 3: A select field needs at least one option.');
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();

        setField(ed, 1, 'name', 'work_email');
        setField(ed, 2, 'options', 'Basic, Pro');
        expect(rowHint(ed, 1).style.display).toBe('none');
        submit(ed);
        expect(storedFields(ed).map((f: { name: string }) => f.name)).toEqual(['email', 'work_email', 'plan']);
    });

    it('reorders and removes fields, keeping at least one', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe', {
            fields: [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }, { name: 'c', type: 'text' }],
        }))!;
        block.click();
        items(ed)[2].querySelector<HTMLButtonElement>('button[aria-label="Move field up"]')!.click();
        items(ed)[0].querySelector<HTMLButtonElement>('button[aria-label="Remove field"]')!.click();
        submit(ed);
        expect(storedFields(ed).map((f: { name: string }) => f.name)).toEqual(['c', 'b']);

        ed.editorArea.querySelector<HTMLElement>('.play-editor-amp-form')!.click();
        items(ed)[0].querySelector<HTMLButtonElement>('button[aria-label="Remove field"]')!.click();
        const last = items(ed)[0].querySelector<HTMLButtonElement>('button[aria-label="Remove field"]')!;
        expect(last.disabled).toBe(true);
    });

    it('edits the fields of a form made with the API, keeping its endpoint and choices', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe', {
            fields: [{ name: 'plan', type: 'select', label: 'Plan', options: [{ label: 'Pro plan', value: 'pro' }, 'Basic'] }],
        }))!;
        block.click();
        expect(field(ed, 0, 'options').value).toBe('Pro plan = pro, Basic');
        addField(ed);
        setField(ed, 1, 'label', 'Email');
        setField(ed, 1, 'type', 'email');
        submit(ed);
        const edited = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(storedAction(edited)).toBe('https://example.com/api/subscribe');
        expect(storedFields(ed)).toEqual([
            { name: 'plan', type: 'select', label: 'Plan', options: [{ label: 'Pro plan', value: 'pro' }, 'Basic'] },
            { name: 'email', type: 'email', label: 'Email' },
        ]);
        expect(edited.getAttribute('data-amp-form-summary')).toBe('AMP form · Plan, Email → example.com/api/subscribe');
    });
});

describe('editor UI: the endpoint field', () => {
    it('inserts a form from the toolbar once an endpoint is given', () => {
        const ed = mount();
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Form"]')!.click();
        submit(ed);
        expect(errorText(ed)).toContain('The form needs an endpoint');
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();

        setValue(ed, 'action', 'https://example.com/api/subscribe');
        submit(ed);
        expect(modal(ed)).toBeNull();
        const block = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(storedAction(block)).toBe('https://example.com/api/subscribe');
        expect(stored(block).fields.map((f: { name: string }) => f.name)).toEqual(['email']);
    });

    it('checks the endpoint as it is typed', () => {
        const ed = mount();
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Form"]')!.click();
        setValue(ed, 'action', 'http://example.com/api');
        expect(hintText(ed)).toContain('uses http');
        setValue(ed, 'action', 'https://example.com/{{list}}');
        expect(hintText(ed)).toContain('unresolved variable');
        setValue(ed, 'action', 'https://example.com/api/subscribe');
        expect(hintText(ed)).toBe('Posts to example.com/api/subscribe');
    });

    it('does not save an invalid endpoint from the edit dialog', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        block.click();
        setValue(ed, 'action', 'http://example.com/api/subscribe');
        submit(ed);
        expect(errorText(ed)).toContain('uses http');
        expect(storedAction(ed.editorArea.querySelector('.play-editor-amp-form')!)).toBe('https://example.com/api/subscribe');
    });

    it('does not open the editor while the editor is read-only', () => {
        const ed = mount();
        const block = addAmpForm(ed, form('https://example.com/api/subscribe'))!;
        ed.editorArea.contentEditable = 'false';
        block.click();
        expect(modal(ed)).toBeNull();
    });
});
