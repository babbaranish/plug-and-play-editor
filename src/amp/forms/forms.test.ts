import { describe, it, expect } from 'vitest';
import type { AmpFormConfig } from './types';
import { validateAmpFormConfig } from './formValidator';
import { AmpFormConfigError, normalizeAmpFormConfig, parseAmpFormConfig, readAmpFormConfig, readStoredAmpFormConfig, DEFAULT_FALLBACK_TEXT } from './formConfig';
import { renderAmpForm, renderAmpFormBlock } from './formRenderer';
import { toAmpEmail } from '../index';

const subscribe: AmpFormConfig = {
    action: 'https://example.com/api/subscribe',
    method: 'POST',
    fields: [
        { name: 'email', type: 'email', label: 'Email Address', placeholder: 'Enter your email', required: true },
        { name: 'name', type: 'text', label: 'Full Name', placeholder: 'Enter your name', required: true },
    ],
    submitText: 'Subscribe',
    successMessage: 'Successfully subscribed!',
    errorMessage: 'Something went wrong!',
};

const paths = (config: unknown) => validateAmpFormConfig(config).map(i => i.path);
const messages = (config: unknown) => validateAmpFormConfig(config).map(i => i.message);
const withConfig = (over: Record<string, unknown>) => ({ ...subscribe, ...over });
const withField = (field: Record<string, unknown>) => withConfig({ fields: [field] });

function body(html: string): HTMLDivElement {
    const m = /<body>\n([\s\S]*)\n<\/body>/.exec(html);
    const div = document.createElement('div');
    div.innerHTML = m ? m[1] : '';
    return div;
}

describe('validateAmpFormConfig', () => {
    it('accepts the proposed subscribe form', () => {
        expect(validateAmpFormConfig(subscribe)).toEqual([]);
    });

    it('accepts every supported field type', () => {
        expect(validateAmpFormConfig(withConfig({
            fields: [
                { name: 'a', type: 'text' },
                { name: 'b', type: 'email' },
                { name: 'c', type: 'number' },
                { name: 'd', type: 'textarea', placeholder: 'Say hi' },
                { name: 'e', type: 'select', options: ['One', { label: 'Two', value: '2' }] },
            ],
        }))).toEqual([]);
    });

    it('needs an object', () => {
        expect(messages(null)).toEqual(['The form config must be an object.']);
        expect(messages([])).toEqual(['The form config must be an object.']);
    });

    it('reports a missing, invalid, non-https or variable endpoint', () => {
        expect(paths(withConfig({ action: undefined }))).toEqual(['action']);
        expect(messages(withConfig({ action: 'not a url' }))[0]).toContain('not a valid absolute URL');
        expect(messages(withConfig({ action: 'http://example.com/x' }))[0]).toContain('AMP email forms can only post to https');
        expect(messages(withConfig({ action: '{{endpoint}}' }))[0]).toContain('unresolved variable');
    });

    it('only allows POST', () => {
        expect(validateAmpFormConfig(withConfig({ method: 'post' }))).toEqual([]);
        expect(paths(withConfig({ method: 'GET' }))).toEqual(['method']);
    });

    it('reports unsupported field types', () => {
        expect(paths(withField({ name: 'pw', type: 'password' }))).toEqual(['fields[0].type']);
    });

    it('reports missing, malformed, reserved and duplicate field names', () => {
        expect(paths(withField({ type: 'text' }))).toEqual(['fields[0].name']);
        expect(paths(withField({ name: '2fast', type: 'text' }))).toEqual(['fields[0].name']);
        expect(paths(withField({ name: '__amp_source_origin', type: 'text' }))).toEqual(['fields[0].name']);
        expect(messages(withConfig({ fields: [{ name: 'email', type: 'email' }, { name: 'email', type: 'text' }] })))
            .toEqual(['Field name "email" is used twice.']);
    });

    it('needs at least one field', () => {
        expect(paths(withConfig({ fields: [] }))).toEqual(['fields']);
        expect(paths(withConfig({ fields: undefined }))).toEqual(['fields']);
    });

    it('reports invalid select options', () => {
        expect(paths(withField({ name: 's', type: 'select' }))).toEqual(['fields[0].options']);
        expect(paths(withField({ name: 's', type: 'select', options: [] }))).toEqual(['fields[0].options']);
        expect(paths(withField({ name: 's', type: 'select', options: ['a', 'a'] }))).toEqual(['fields[0].options[1]']);
        expect(paths(withField({ name: 's', type: 'select', options: [{ label: '', value: 'x' }] }))).toEqual(['fields[0].options[0].label']);
        expect(paths(withField({ name: 's', type: 'select', options: [{ label: 'X', value: '' }] }))).toEqual(['fields[0].options[0]']);
        expect(paths(withField({ name: 's', type: 'select', options: [3] }))).toEqual(['fields[0].options[0]']);
        expect(paths(withField({ name: 't', type: 'text', options: ['a'] }))).toEqual(['fields[0].options']);
    });

    it('rejects submit callbacks and explains why', () => {
        const issues = validateAmpFormConfig(withConfig({ onSubmit: () => undefined }));
        expect(issues.map(i => i.path)).toEqual(['onSubmit']);
        expect(issues[0].message).toContain("recipient's email client");
    });

    it('reports other unsupported configuration', () => {
        expect(paths(withConfig({ target: '_top' }))).toEqual(['target']);
        expect(paths(withField({ name: 'a', type: 'text', onChange: 'x' }))).toEqual(['fields[0].onChange']);
    });

    it('reports wrongly typed values', () => {
        expect(paths(withConfig({ submitText: '' }))).toEqual(['submitText']);
        expect(paths(withField({ name: 'a', type: 'text', required: 'yes' }))).toEqual(['fields[0].required']);
        expect(paths(withConfig({ fallbackUrl: 'javascript:alert(1)' }))).toEqual(['fallbackUrl']);
    });
});

describe('config helpers', () => {
    it('fills in defaults', () => {
        const n = normalizeAmpFormConfig({ action: 'https://x.test/f', fields: [{ name: 'q', type: 'select', options: ['A'] }] });
        expect(n.method).toBe('POST');
        expect(n.submitText).toBe('Submit');
        expect(n.fallbackText).toBe(DEFAULT_FALLBACK_TEXT);
        expect(n.fields[0]).toEqual({ name: 'q', type: 'select', label: '', placeholder: '', required: false, options: [{ label: 'A', value: 'A' }] });
    });

    it('throws every problem at once', () => {
        try {
            parseAmpFormConfig({ action: 'http://x', fields: [] });
            throw new Error('expected a throw');
        } catch (e) {
            expect(e).toBeInstanceOf(AmpFormConfigError);
            expect((e as AmpFormConfigError).issues.map(i => i.path)).toEqual(['action', 'fields']);
            expect((e as Error).message).toContain('action: The endpoint "http://x" uses http. AMP email forms can only post to https.');
        }
    });

    it('reads a block back', () => {
        const read = readAmpFormConfig(renderAmpFormBlock(subscribe, document));
        expect('config' in read && read.config.fields.map(f => f.name)).toEqual(['email', 'name']);
    });

    it('reports a legacy block whose JSON is unreadable', () => {
        const legacy = document.createElement('div');
        legacy.className = 'play-editor-amp-form';
        legacy.setAttribute('data-amp-form', '{broken');
        expect(readAmpFormConfig(legacy)).toEqual({ issues: [{ path: '', message: 'The form settings stored on this block are not readable JSON.' }] });
    });
});

describe('renderAmpForm', () => {
    const form = renderAmpForm(normalizeAmpFormConfig(withConfig({
        fields: [
            ...subscribe.fields,
            { name: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose…', required: true, options: [{ label: 'Pro', value: 'pro' }] },
            { name: 'msg', type: 'textarea', label: 'Message' },
            { name: 'age', type: 'number' },
        ],
    })), document, 2);

    it('posts to the endpoint with action-xhr, without target or action', () => {
        expect(form.getAttribute('method')).toBe('post');
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/subscribe');
        expect(form.hasAttribute('target')).toBe(false);
        expect(form.hasAttribute('action')).toBe(false);
    });

    it('labels each control and carries name, placeholder and required', () => {
        const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
        expect(email.type).toBe('email');
        expect(email.id).toBe('amp-form-2-email');
        expect(email.getAttribute('placeholder')).toBe('Enter your email');
        expect(email.hasAttribute('required')).toBe(true);
        expect(form.querySelector('label[for="amp-form-2-email"]')!.textContent).toBe('Email Address');
        expect(form.querySelector('input[name="age"]')!.getAttribute('type')).toBe('number');
        expect(form.querySelector('label[for="amp-form-2-age"]')).toBeNull();
        expect(form.querySelector('textarea[name="msg"]')).not.toBeNull();
    });

    it('turns a select placeholder into a disabled first option', () => {
        const options = Array.from(form.querySelectorAll('select[name="plan"] option'));
        expect(options.map(o => [o.getAttribute('value'), o.textContent])).toEqual([['', 'Choose…'], ['pro', 'Pro']]);
        expect(options[0].hasAttribute('disabled')).toBe(true);
        expect(form.querySelector('select')!.hasAttribute('placeholder')).toBe(false);
    });

    it('has a submit button and the three states, as plain content', () => {
        expect(form.querySelector('button[type="submit"]')!.textContent).toBe('Subscribe');
        expect(form.querySelector('[submitting]')!.textContent).toBe('Sending…');
        expect(form.querySelector('[submit-success]')!.textContent).toBe('Successfully subscribed!');
        expect(form.querySelector('[submit-error]')!.textContent).toBe('Something went wrong!');
        expect(form.querySelector('template, script')).toBeNull();
        expect(Array.from(form.querySelectorAll('*')).some(el => Array.from(el.attributes).some(a => a.name.startsWith('on')))).toBe(false);
    });

    it('keeps config text as text', () => {
        const f = renderAmpForm(normalizeAmpFormConfig(withConfig({
            successMessage: '<img src=x onerror=alert(1)>',
            fields: [{ name: 'a', type: 'text', label: '<b>A</b>', placeholder: '" onfocus="x' }],
        })), document);
        expect(f.querySelector('[submit-success]')!.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(f.querySelector('img, b')).toBeNull();
        expect(f.querySelector('input')!.getAttribute('placeholder')).toBe('" onfocus="x');
        expect(f.querySelector('input')!.hasAttribute('onfocus')).toBe(false);
    });
});

describe('renderAmpFormBlock', () => {
    it('stores the config and shows the fallback', () => {
        const block = renderAmpFormBlock(subscribe, document);
        expect(block.className).toBe('play-editor-amp-form');
        expect(block.getAttribute('contenteditable')).toBe('false');
        expect(readStoredAmpFormConfig(block)).toEqual(subscribe);
        expect(block.getAttribute('data-amp-form-summary')).toBe('AMP form · Email Address, Full Name → example.com/api/subscribe');
        expect(block.textContent).toBe(DEFAULT_FALLBACK_TEXT);
        expect(block.querySelector('a, form, input')).toBeNull();
    });

    it('links to the web version when given', () => {
        const a = renderAmpFormBlock(withConfig({ fallbackUrl: 'https://example.com/subscribe' }) as AmpFormConfig, document).querySelector('a')!;
        expect(a.getAttribute('href')).toBe('https://example.com/subscribe');
        expect(a.textContent).toBe('Subscribe');
    });
});

describe('forms in toAmpEmail', () => {
    const block = (config: AmpFormConfig = subscribe) => renderAmpFormBlock(config, document).outerHTML;

    it('replaces the block with a working AMP form and loads amp-form', () => {
        const r = toAmpEmail(`<p>Join us</p>${block()}`);
        expect(r.valid).toBe(true);
        expect(r.issues).toEqual([]);
        expect(r.extensions).toEqual(['amp-form']);
        expect(r.html).toContain('<script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>');
        const b = body(r.html);
        expect(b.querySelector('.play-editor-amp-form, [data-amp-form]')).toBeNull();
        const form = b.querySelector('form')!;
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/subscribe');
        // The clean-up pass left the generated form alone.
        expect(form.querySelectorAll('input').length).toBe(2);
        expect(form.querySelector('[submit-success]')).not.toBeNull();
        expect(form.querySelector('input')!.getAttribute('style')).toContain('width: 100%');
    });

    it('gives each form its own ids', () => {
        const b = body(toAmpEmail(block() + block()).html);
        const ids = Array.from(b.querySelectorAll('input')).map(i => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('reports a block whose stored config is invalid and keeps its fallback', () => {
        const html = block().replace('https://example.com/api/subscribe', 'http://example.com/api/subscribe');
        const r = toAmpEmail(html);
        expect(r.valid).toBe(false);
        expect(r.issues.map(i => i.code)).toEqual(['form-invalid']);
        expect(r.issues[0].message).toBe('Form 1: action: The endpoint "http://example.com/api/subscribe" uses http. AMP email forms can only post to https.');
        expect(body(r.html).querySelector('form')).toBeNull();
        expect(body(r.html).textContent).toContain(DEFAULT_FALLBACK_TEXT);
    });

    it('still removes a hand-written form', () => {
        const r = toAmpEmail('<form action="https://x.test/f"><input name="a"><button>Go</button></form><p>after</p>');
        expect(body(r.html).querySelector('form, input, button')).toBeNull();
        expect(r.issues.map(i => i.code)).toEqual(['element-removed']);
        expect(r.valid).toBe(true);
    });

    it('does not let content mark itself final to skip the clean-up', () => {
        const r = toAmpEmail('<div data-pe-amp-final><script>alert(1)</script><form><input name="a"></form></div>');
        expect(r.html).not.toContain('<script>alert');
        expect(r.html).not.toContain('<form');
        expect(r.html).not.toContain('data-pe-amp-final');
    });

    it('leaves no marker in the output', () => {
        expect(toAmpEmail(block()).html).not.toContain('data-pe-amp-final');
    });

    it('validation reports form elements outside a form', () => {
        const stray = (root: DocumentFragment, ctx: Parameters<import('../types').AmpTransformer>[1]) => {
            const input = ctx.doc.createElement('input');
            root.appendChild(input);
            ctx.finalize(input);
        };
        const r = toAmpEmail('<p>x</p>', { transformers: [stray] });
        expect(r.issues.map(i => i.message)).toEqual(['<input> is only allowed inside a form.']);
    });
});
