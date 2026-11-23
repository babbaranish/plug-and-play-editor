import type { AmpFormConfig, NormalizedAmpFormConfig, NormalizedAmpFormField, NormalizedAmpFormStyle } from './types';
import { AMP_FORM_CLASS, AMP_FORM_SUMMARY_ATTR, normalizeAmpFormConfig, writeAmpFormSettings } from './formConfig';
import { fontStack } from './formStyle';

// Inline styles: email clients drop most <style> rules, and AMP counts these
// toward its CSS budget (a few hundred bytes per field). Every value comes
// from a validated design setting: hex colours, whole pixels, a listed font.

interface FormCss {
    form: string;
    fieldWrap: string;
    label: string;
    control: string;
    buttonWrap: string;
    button: string;
    message: (color: string) => string;
}

function cssFor(style: NormalizedAmpFormStyle): FormCss {
    const font = fontStack(style.fontFamily);
    const fontDecl = font ? `; font-family: ${font}` : '';
    const form = [
        style.maxWidth > 0 ? `max-width: ${style.maxWidth}px` : '',
        font ? `font-family: ${font}` : '',
    ].filter(Boolean).join('; ');
    return {
        form,
        fieldWrap: `margin: 0 0 ${style.fieldSpacing}px`,
        label: `display: block;${style.labelBold ? ' font-weight: bold;' : ''} color: ${style.labelColor}; margin: 0 0 4px`,
        control: `display: block; width: 100%; padding: 8px; border: 1px solid ${style.fieldBorderColor}; border-radius: ${style.fieldRadius}px;` +
            ` background-color: ${style.fieldBackground}; box-sizing: border-box; font-size: ${style.fieldTextSize}px${fontDecl}`,
        buttonWrap: `text-align: ${style.buttonAlign}`,
        button: `padding: 10px 20px; background-color: ${style.buttonColor}; color: ${style.buttonTextColor}; border: 0;` +
            ` border-radius: ${style.buttonRadius}px; font-size: ${style.fieldTextSize}px; font-weight: bold; cursor: pointer` +
            `${style.buttonFullWidth ? '; width: 100%' : ''}${fontDecl}`,
        message: (color) => `margin: 12px 0 0; color: ${color}`,
    };
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

function control(doc: Document, field: NormalizedAmpFormField, id: string, css: FormCss): HTMLElement {
    const common: Record<string, string> = { id, name: field.name, style: css.control };
    let node: HTMLElement;
    if (field.type === 'select') {
        node = el(doc, 'select', common);
        if (field.placeholder) {
            node.appendChild(el(doc, 'option', { value: '', disabled: '', selected: '' }, field.placeholder));
        }
        for (const option of field.options) node.appendChild(el(doc, 'option', { value: option.value }, option.label));
    } else if (field.type === 'textarea') {
        node = el(doc, 'textarea', { ...common, rows: '4' });
    } else {
        node = el(doc, 'input', { type: field.type, ...common });
    }
    if (field.placeholder && field.type !== 'select') node.setAttribute('placeholder', field.placeholder);
    if (field.required) node.setAttribute('required', '');
    return node;
}

function message(doc: Document, state: 'submitting' | 'submit-success' | 'submit-error', text: string, style: string): HTMLElement {
    // Plain content: AMP shows it in that state. A template would need
    // amp-mustache, whose {{ }} the sender's variable substitution would also rewrite.
    const wrap = el(doc, 'div', { [state]: '' });
    wrap.appendChild(el(doc, 'p', { style }, text));
    return wrap;
}

/**
 * The AMP email markup for a form: `<form method="post" action-xhr>` with a
 * labelled control per field, a submit button and the submitting / success /
 * error states. No `target` (AMP email rejects it on forms) and no script.
 * `index` keeps ids unique when an email has several forms.
 */
export function renderAmpForm(config: NormalizedAmpFormConfig, doc: Document, index = 1): HTMLFormElement {
    const css = cssFor(config.style);
    const form = el(doc, 'form', { method: 'post', 'action-xhr': config.action });
    if (css.form) form.setAttribute('style', css.form);
    for (const field of config.fields) {
        const id = `amp-form-${index}-${field.name}`;
        const wrap = el(doc, 'div', { style: css.fieldWrap });
        if (field.label) wrap.appendChild(el(doc, 'label', { for: id, style: css.label }, field.label));
        wrap.appendChild(control(doc, field, id, css));
        form.appendChild(wrap);
    }
    const buttonWrap = el(doc, 'div', { style: css.buttonWrap });
    buttonWrap.appendChild(el(doc, 'button', { type: 'submit', style: css.button }, config.submitText));
    form.appendChild(buttonWrap);
    form.appendChild(message(doc, 'submitting', config.submittingMessage, css.message('#475569')));
    form.appendChild(message(doc, 'submit-success', config.successMessage, css.message(config.style.successColor)));
    form.appendChild(message(doc, 'submit-error', config.errorMessage, css.message(config.style.errorColor)));
    return form;
}

/** The endpoint as the block summary shows it: host and path, so two forms on one host are told apart. */
export function endpointLabel(action: string, max = 60): string {
    let label = action;
    try {
        const url = new URL(action);
        label = `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch { /* keep as is */ }
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** The one-line summary the editor shows on a form block: its fields and endpoint. */
export function summaryOf(config: NormalizedAmpFormConfig): string {
    const fields = config.fields.map(f => f.label || f.name).join(', ');
    return `AMP form · ${fields} → ${endpointLabel(config.action)}`;
}

/**
 * The block the editor stores for a form, in a readable format:
 *
 * ```html
 * <div class="play-editor-amp-form" contenteditable="false"
 *      data-action="https://example.com/api/subscribe" data-submit-text="Subscribe">
 *   <div data-amp-field="email" data-type="email" data-label="Email" data-required></div>
 *   <p>This email has a form…</p>
 * </div>
 * ```
 *
 * The settings are attributes and each field an empty element, so the
 * content (what recipients of the HTML version see) is just the fallback
 * text and, when given, a link to a web version of the form. The AMP
 * converter replaces the whole block with {@link renderAmpForm}'s markup.
 */
export function renderAmpFormBlock(config: AmpFormConfig, doc: Document): HTMLDivElement {
    const normalized = normalizeAmpFormConfig(config);
    const block = el(doc, 'div', { class: AMP_FORM_CLASS, contenteditable: 'false' });
    const fields = writeAmpFormSettings(block, config);
    block.setAttribute(AMP_FORM_SUMMARY_ATTR, summaryOf(normalized));
    block.setAttribute('style', 'margin: 1em 0');
    block.append(...fields);
    block.appendChild(el(doc, 'p', { style: 'margin: 0 0 8px' }, normalized.fallbackText));
    if (normalized.fallbackUrl) {
        const p = el(doc, 'p', { style: 'margin: 0' });
        p.appendChild(el(doc, 'a', {
            href: normalized.fallbackUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            // The form's button look, so both versions of the email match.
            style: `display: inline-block; padding: 10px 20px; background-color: ${normalized.style.buttonColor};` +
                ` color: ${normalized.style.buttonTextColor}; border-radius: ${normalized.style.buttonRadius}px;` +
                ` text-decoration: none; font-weight: bold${fontStack(normalized.style.fontFamily) ? `; font-family: ${fontStack(normalized.style.fontFamily)}` : ''}`,
        }, normalized.submitText));
        block.appendChild(p);
    }
    return block;
}
