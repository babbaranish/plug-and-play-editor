/**
 * Form design: per-form settings (colours, corners, sizes, alignment, font),
 * stored as readable attributes, checked so they can't break the CSS, applied
 * to the AMP form and the HTML version's link, editable in the dialog, and
 * defaulted per editor with createAmpFormPlugin({ defaultStyle }).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpFormPlugin, createAmpFormPlugin, addAmpForm } from './amp-form';
import { buildPreviewHtml } from './side-preview';
import { AmpFormConfigError, normalizeAmpFormConfig, readStoredAmpFormConfig } from '../amp/forms/formConfig';
import { renderAmpForm, renderAmpFormBlock } from '../amp/forms/formRenderer';
import { compactAmpFormStyle, validateAmpFormStyle } from '../amp/forms/formStyle';
import type { AmpFormConfig, AmpFormStyle } from '../amp/forms/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(plugins: Plugin[] = [AmpFormPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = '<p>Hello</p>';
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const base: AmpFormConfig = {
    action: 'https://example.com/api/subscribe',
    fields: [{ name: 'email', type: 'email', label: 'Email', required: true }],
    submitText: 'Subscribe',
};

const brand: AmpFormStyle = {
    buttonColor: '#D63736',
    buttonTextColor: '#fff',
    buttonRadius: 20,
    buttonFullWidth: true,
    buttonAlign: 'center',
    fieldBorderColor: '#999999',
    fieldBackground: '#fafafa',
    fieldRadius: 8,
    fieldTextSize: 17,
    labelColor: '#333333',
    labelBold: false,
    successColor: '#006600',
    errorColor: '#990000',
    fieldSpacing: 20,
    maxWidth: 480,
    fontFamily: 'Georgia',
};

const formOf = (config: AmpFormConfig) => renderAmpForm(normalizeAmpFormConfig(config), document);

describe('validating design settings', () => {
    it('accepts every setting', () => {
        expect(validateAmpFormStyle(brand)).toEqual([]);
    });

    it('only takes hex colours, so nothing can be slipped into the CSS', () => {
        for (const bad of ['red', '#12345', 'url(x)', '#fff; background: url(x)', 'expression(alert(1))']) {
            expect(validateAmpFormStyle({ buttonColor: bad }).map(i => i.message)).toEqual(['buttonColor must be a hex color such as #3b82f6.']);
        }
    });

    it('takes whole numbers in range', () => {
        expect(validateAmpFormStyle({ buttonRadius: 41 })[0].message).toBe('buttonRadius must be a whole number from 0 to 40.');
        expect(validateAmpFormStyle({ fieldTextSize: 15.5 })).toHaveLength(1);
        expect(validateAmpFormStyle({ fieldSpacing: '10' as unknown as number })).toHaveLength(1);
    });

    it('takes only listed fonts and positions', () => {
        expect(validateAmpFormStyle({ fontFamily: 'Comic Neue' })[0].message).toContain('fontFamily must be one of Arial, Helvetica, Georgia');
        expect(validateAmpFormStyle({ buttonAlign: 'middle' as 'left' })[0].message).toBe('buttonAlign must be one of left, center, right.');
    });

    it('reports unknown settings and a style that is not an object', () => {
        expect(validateAmpFormStyle({ buttonColour: '#fff' } as AmpFormStyle)[0].message).toBe('"buttonColour" is not a design setting.');
        expect(validateAmpFormStyle('red')[0].message).toBe('style must be an object of design settings.');
    });

    it('is part of config validation, and addAmpForm refuses a bad design', () => {
        const ed = mount();
        expect(() => addAmpForm(ed, { ...base, style: { buttonColor: 'red' } })).toThrow(AmpFormConfigError);
        expect(ed.editorArea.querySelector('.play-editor-amp-form')).toBeNull();
    });
});

describe('the AMP form with a design', () => {
    it('keeps the default look when no design is set', () => {
        const form = formOf(base);
        expect(form.hasAttribute('style')).toBe(false);
        expect(form.querySelector('button')!.getAttribute('style')).toContain('background-color: #3b82f6; color: #ffffff');
        expect(form.querySelector('label')!.getAttribute('style')).toContain('font-weight: bold');
    });

    it('applies every setting', () => {
        const form = formOf({ ...base, style: brand });
        expect(form.getAttribute('style')).toBe('max-width: 480px; font-family: Georgia, serif');
        const button = form.querySelector('button')!.getAttribute('style')!;
        expect(button).toContain('background-color: #d63736; color: #ffffff');
        expect(button).toContain('border-radius: 20px');
        expect(button).toContain('font-size: 17px');
        expect(button).toContain('width: 100%');
        expect(form.querySelector('button')!.parentElement!.getAttribute('style')).toBe('text-align: center');
        const control = form.querySelector('input')!.getAttribute('style')!;
        expect(control).toContain('border: 1px solid #999999; border-radius: 8px;');
        expect(control).toContain('background-color: #fafafa');
        expect(control).toContain('font-size: 17px');
        const label = form.querySelector('label')!.getAttribute('style')!;
        expect(label).not.toContain('font-weight');
        expect(label).toContain('color: #333333');
        expect(form.querySelector('input')!.parentElement!.getAttribute('style')).toBe('margin: 0 0 20px');
        expect(form.querySelector('[submit-success] p')!.getAttribute('style')).toContain('color: #006600');
        expect(form.querySelector('[submit-error] p')!.getAttribute('style')).toContain('color: #990000');
    });

    it('styles the HTML version\'s link like the button', () => {
        const link = renderAmpFormBlock({ ...base, fallbackUrl: 'https://example.com/s', style: brand }, document).querySelector('a')!;
        expect(link.getAttribute('style')).toContain('background-color: #d63736; color: #ffffff; border-radius: 20px');
        expect(link.getAttribute('style')).toContain('font-family: Georgia, serif');
    });

    it('shows in the AMP preview, the form\'s own width and font included', () => {
        const div = document.createElement('div');
        div.innerHTML = buildPreviewHtml(renderAmpFormBlock({ ...base, style: brand }, document).outerHTML, {}, { version: 'amp' });
        expect(div.querySelector('button')!.getAttribute('style')).toContain('#d63736');
        expect(div.querySelector('form')!.getAttribute('style')).toBe('margin: 1em 0; max-width: 480px; font-family: Georgia, serif');
    });

    it('converts to valid AMP', () => {
        const r = toAmpEmail(renderAmpFormBlock({ ...base, style: brand }, document).outerHTML);
        expect(r.valid).toBe(true);
        expect(r.html).toContain('background-color: #d63736');
    });
});

describe('storing a design', () => {
    it('writes readable attributes, only for settings that are set', () => {
        const block = renderAmpFormBlock({ ...base, style: { buttonColor: '#d63736', labelBold: false, maxWidth: 480, fontFamily: 'Georgia' } }, document);
        expect(block.getAttribute('data-button-color')).toBe('#d63736');
        expect(block.getAttribute('data-label-bold')).toBe('false');
        expect(block.getAttribute('data-max-width')).toBe('480');
        expect(block.getAttribute('data-font-family')).toBe('Georgia');
        expect(block.hasAttribute('data-button-radius')).toBe(false);
        expect(block.outerHTML).not.toContain('&quot;');
    });

    it('reads back with the right types', () => {
        expect(readStoredAmpFormConfig(renderAmpFormBlock({ ...base, style: brand }, document))!.style).toEqual(brand);
    });

    it('checks a design edited by hand in the source view', () => {
        const html = renderAmpFormBlock(base, document).outerHTML
            .replace('data-submit-text', 'data-button-color="red; background: url(x)" data-button-radius="big" data-submit-text');
        const r = toAmpEmail(html);
        expect(r.valid).toBe(false);
        expect(r.issues.map(i => i.message)).toEqual([
            'Form 1: style.buttonColor: buttonColor must be a hex color such as #3b82f6.',
            'Form 1: style.buttonRadius: buttonRadius must be a whole number from 0 to 40.',
        ]);
        expect(r.html).not.toContain('url(x)');
    });

    it('drops settings equal to the default look', () => {
        expect(compactAmpFormStyle({ buttonColor: '#3B82F6', buttonRadius: 4, labelBold: true })).toBeUndefined();
        expect(compactAmpFormStyle({ buttonColor: '#fff', labelBold: false })).toEqual({ buttonColor: '#ffffff', labelBold: false });
    });
});

describe('brand defaults: createAmpFormPlugin({ defaultStyle })', () => {
    const branded = () => createAmpFormPlugin({ defaultStyle: { buttonColor: '#d63736', fontFamily: 'Georgia' } });

    it('refuses an invalid default design when created', () => {
        expect(() => createAmpFormPlugin({ defaultStyle: { buttonColor: 'red' } })).toThrow(AmpFormConfigError);
    });

    it('gives forms added with the API the default design, under their own', () => {
        const ed = mount([branded()]);
        const a = addAmpForm(ed, base)!;
        expect(readStoredAmpFormConfig(a)!.style).toEqual({ buttonColor: '#d63736', fontFamily: 'Georgia' });
        const b = addAmpForm(ed, { ...base, style: { buttonColor: '#000000' } })!;
        expect(readStoredAmpFormConfig(b)!.style).toEqual({ buttonColor: '#000000', fontFamily: 'Georgia' });
    });

    it('starts a toolbar form with the default design in the dialog', () => {
        const ed = mount([branded()]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Form"]')!.click();
        const modal = ed.container.querySelector('.play-editor-modal')!;
        expect(modal.querySelector<HTMLInputElement>('[name="style.buttonColor"]')!.value).toBe('#d63736');
        expect(modal.querySelector<HTMLSelectElement>('[name="style.fontFamily"]')!.value).toBe('Georgia');
    });
});

describe('the design section of the dialog', () => {
    const open = (ed: Editor, block: Element) => {
        (block as HTMLElement).click();
        return ed.container.querySelector('.play-editor-modal')!;
    };
    const set = (modal: Element, name: string, value: string) => {
        const el = modal.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        if (el.getAttribute('type') === 'checkbox') el.checked = value === 'true';
        else el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const save = (modal: Element) => modal.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();

    it('shows the current design and saves changes', () => {
        const ed = mount();
        const block = addAmpForm(ed, { ...base, style: { buttonColor: '#d63736' } })!;
        const modal = open(ed, block);
        expect(modal.querySelector<HTMLInputElement>('[name="style.buttonColor"]')!.value).toBe('#d63736');
        expect(modal.querySelector<HTMLInputElement>('[name="style.labelBold"]')!.checked).toBe(true);
        set(modal, 'style.buttonAlign', 'center');
        set(modal, 'style.labelBold', '');
        set(modal, 'style.fieldRadius', '10');
        save(modal);
        const saved = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(readStoredAmpFormConfig(saved)!.style).toEqual({ buttonColor: '#d63736', buttonAlign: 'center', labelBold: false, fieldRadius: 10 });
        expect(storedAction(saved)).toBe('https://example.com/api/subscribe');
    });

    it('stores nothing for settings put back to the default look', () => {
        const ed = mount();
        const block = addAmpForm(ed, { ...base, style: { buttonColor: '#d63736' } })!;
        const modal = open(ed, block);
        set(modal, 'style.buttonColor', '#3b82f6');
        save(modal);
        const saved = ed.editorArea.querySelector('.play-editor-amp-form')!;
        expect(saved.hasAttribute('data-button-color')).toBe(false);
        expect(readStoredAmpFormConfig(saved)!.style).toBeUndefined();
    });

    it('names an out-of-range setting by its label', () => {
        const ed = mount();
        const modal = open(ed, addAmpForm(ed, base)!);
        set(modal, 'style.buttonRadius', '99');
        save(modal);
        expect(modal.querySelector('.play-editor-modal-error')!.textContent).toBe('Button corners (px) must be a whole number from 0 to 40.');
    });
});

function storedAction(block: Element): unknown {
    return readStoredAmpFormConfig(block)!.action;
}
