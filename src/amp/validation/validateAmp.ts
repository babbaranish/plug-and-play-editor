import type { AmpContext } from '../types';

/**
 * The AMP for Email rules this converter enforces. A conservative subset of
 * the spec: the transformers rewrite content into it, and validation checks
 * the output against it. The official AMP validator remains the final word
 * before sending.
 */

/** Elements kept as they are. Tag names are upper case, as `Element.tagName` reports them. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
    'A', 'ABBR', 'ARTICLE', 'ASIDE', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'COL', 'COLGROUP',
    'DD', 'DEL', 'DIV', 'DL', 'DT', 'EM', 'FIGCAPTION', 'FIGURE', 'FOOTER',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'I', 'INS', 'LI', 'MAIN', 'MARK', 'NAV',
    'OL', 'P', 'PRE', 'Q', 'S', 'SECTION', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP',
    'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
    'AMP-IMG', 'AMP-ACCORDION',
]);

/**
 * Form elements: valid only inside an amp-form `<form>`. The clean-up pass
 * still removes any it finds outside a generated (finalized) form, since a
 * hand-written form has no AMP endpoint.
 */
export const FORM_TAGS: ReadonlySet<string> = new Set([
    'FORM', 'INPUT', 'SELECT', 'OPTION', 'TEXTAREA', 'BUTTON', 'LABEL', 'FIELDSET', 'LEGEND',
]);

/**
 * Elements only generated markup uses (a quiz's choices). Not in
 * {@link ALLOWED_TAGS}, so the clean-up pass unwraps any written in content;
 * validation accepts them in the output.
 */
export const GENERATED_TAGS: ReadonlySet<string> = new Set(['AMP-SELECTOR']);

/** Elements removed with their content: they can run code, embed other documents or don't work in email. */
export const DROPPED_TAGS: ReadonlySet<string> = new Set([
    'SCRIPT', 'NOSCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'BASE', 'TITLE',
    'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'PORTAL',
    'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'SVG', 'MATH',
    'FORM', 'INPUT', 'SELECT', 'OPTION', 'TEXTAREA', 'BUTTON',
]);

const GLOBAL_ATTRS: ReadonlySet<string> = new Set(['class', 'id', 'style', 'dir', 'lang', 'title']);

const ALIGN = /^(left|right|center|justify)$/i;
const VALIGN = /^(top|middle|bottom|baseline)$/i;
const LENGTH = /^\d+(\.\d+)?(%|px)?$/;
const INTEGER = /^\d+$/;
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

/** Per-element attributes, each with the values it may take (`null`: any value). */
const TAG_ATTRS: Readonly<Record<string, Readonly<Record<string, RegExp | null>>>> = {
    A: { href: null, target: /^_blank$/, rel: null },
    'AMP-IMG': { src: null, alt: null, width: INTEGER, height: INTEGER, layout: /^(fixed|fixed-height|flex-item|intrinsic|responsive|fill|nodisplay)$/ },
    'AMP-ACCORDION': { animate: /^$/, 'expand-single-section': /^$/, 'disable-session-states': /^$/ },
    SECTION: { expanded: /^$/ },
    TABLE: { align: ALIGN, bgcolor: COLOR, border: INTEGER, cellpadding: INTEGER, cellspacing: INTEGER, width: LENGTH },
    TR: { align: ALIGN, bgcolor: COLOR, valign: VALIGN },
    TD: { align: ALIGN, bgcolor: COLOR, colspan: INTEGER, rowspan: INTEGER, valign: VALIGN, width: LENGTH, height: LENGTH },
    TH: { align: ALIGN, bgcolor: COLOR, colspan: INTEGER, rowspan: INTEGER, valign: VALIGN, width: LENGTH, height: LENGTH, scope: /^(row|col|rowgroup|colgroup)$/ },
    COL: { span: INTEGER, width: LENGTH, align: ALIGN, valign: VALIGN },
    COLGROUP: { span: INTEGER, width: LENGTH, align: ALIGN, valign: VALIGN },
    OL: { start: /^-?\d+$/, type: /^[1aAiI]$/, reversed: /^$/ },
    LI: { value: /^-?\d+$/ },
    // Forms (amp-form). No `action` or `target`: AMP email rejects both on forms.
    FORM: { method: /^(post|get)$/i, 'action-xhr': null },
    INPUT: {
        // AMP email rejects password and file inputs.
        type: /^(text|email|number|tel|url|search|date|checkbox|radio|hidden|submit|reset|button)$/i,
        name: null, value: null, placeholder: null, required: /^$/, disabled: /^$/, readonly: /^$/, checked: /^$/,
        min: null, max: null, step: null, minlength: INTEGER, maxlength: INTEGER, pattern: null, autocomplete: null,
    },
    SELECT: { name: null, required: /^$/, disabled: /^$/, multiple: /^$/ },
    OPTION: { value: null, selected: /^$/, disabled: /^$/, label: null },
    TEXTAREA: { name: null, placeholder: null, required: /^$/, disabled: /^$/, readonly: /^$/, rows: INTEGER, cols: INTEGER, minlength: INTEGER, maxlength: INTEGER },
    BUTTON: { type: /^(submit|reset|button)$/i, name: null, value: null, disabled: /^$/ },
    LABEL: { for: null },
    // A form's state containers.
    DIV: { submitting: /^$/, 'submit-success': /^$/, 'submit-error': /^$/ },
};

/**
 * Attributes only generated markup uses: a quiz's amp-selector, its choices
 * and what starts hidden. Like {@link GENERATED_TAGS}, the clean-up pass
 * removes them from content (it checks {@link isAllowedAttribute} only), and
 * validation accepts them in the output. The quiz's amp-bind bindings use the
 * `data-amp-bind-…` spelling, which the DOM can create (`[hidden]` it can't);
 * the clean-up pass removes every `data-` attribute from content.
 */
const GENERATED_GLOBAL_ATTRS: Readonly<Record<string, RegExp | null>> = { hidden: /^$/ };
const GENERATED_TAG_ATTRS: Readonly<Record<string, Readonly<Record<string, RegExp | null>>>> = {
    'AMP-SELECTOR': { layout: /^container$/, name: null, disabled: /^$/, on: /^select:AMP\.setState\(/ },
    DIV: { option: null },
};

export function isGeneratedAttribute(tag: string, name: string, value: string): boolean {
    // `null` means any value, so look the name up with `in`, not `??`.
    const forTag = GENERATED_TAG_ATTRS[tag];
    const rule = forTag && name in forTag ? forTag[name] : GENERATED_GLOBAL_ATTRS[name];
    if (rule === undefined) return false;
    return rule === null || rule.test(value.trim());
}

/** Field names AMP reserves (e.g. `__amp_source_origin`). */
const RESERVED_FIELD_NAME = /^__amp/i;

/** Class and id names AMP reserves for its runtime: those starting `-amp-` or `i-amp`. */
const RESERVED_NAME = /(^|\s)(-amp-|i-amp)/;

export function isAllowedAttribute(tag: string, name: string, value: string): boolean {
    if (name.startsWith('data-')) return true;
    if (GLOBAL_ATTRS.has(name)) {
        return (name !== 'class' && name !== 'id') || !RESERVED_NAME.test(value);
    }
    const rule = TAG_ATTRS[tag]?.[name];
    if (rule === undefined) return false;
    return rule === null || rule.test(value.trim());
}

/** Whether `value` is exactly one variable, e.g. `{{pay_link}}`, which the sender substitutes. */
export function isPlaceholder(value: string, [open, close]: readonly [string, string]): boolean {
    const v = value.trim();
    if (v.length <= open.length + close.length || !v.startsWith(open) || !v.endsWith(close)) return false;
    const inner = v.slice(open.length, v.length - close.length);
    return inner.trim().length > 0 && !inner.includes(open) && !inner.includes(close);
}

function protocolOf(value: string): string | null {
    try {
        return new URL(value.trim()).protocol;
    } catch {
        return null;
    }
}

export function isAllowedHref(value: string, delimiters: readonly [string, string]): boolean {
    if (isPlaceholder(value, delimiters)) return true;
    const protocol = protocolOf(value);
    return protocol !== null && ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol);
}

export function isAllowedImageSrc(value: string, delimiters: readonly [string, string]): boolean {
    return isPlaceholder(value, delimiters) || protocolOf(value) === 'https:';
}

function checkLink(a: Element, ctx: AmpContext): void {
    const href = a.getAttribute('href');
    if (href === null) return;
    const v = href.trim();
    if (v === '' || v === '#') {
        ctx.report('error', 'missing-destination', 'This link has no destination. Give it a URL or a variable.', a);
    } else if (!isAllowedHref(v, ctx.options.delimiters)) {
        ctx.report('error', 'invalid-url', `Link URL "${v}" must be an absolute http, https, mailto or tel URL.`, a);
    }
}

/**
 * An address that swallowed the attributes after it, e.g. `src="a.png width="300"`
 * (closing quote missing) reads as `a.png width=`. A URL never contains
 * whitespace followed by `name=`.
 */
const UNCLOSED_ATTRIBUTE = /\s+[a-z-]+\s*=/i;

function checkImage(img: Element, ctx: AmpContext): void {
    const src = img.getAttribute('src');
    const swallowed = src ? UNCLOSED_ATTRIBUTE.exec(src) : null;
    if (swallowed) {
        // Report the cause only: the missing size is a consequence of it.
        const name = swallowed[0].trim().replace(/\s*=$/, '');
        ctx.report('error', 'image-invalid-src',
            `The image's src is missing its closing quote, so "${name}" and what follows were read as part of the address. Add the quote at the end of the URL.`, img);
        return;
    }
    if (!src) {
        ctx.report('error', 'image-invalid-src', 'Image has no source.', img);
    } else if (/^data:/i.test(src.trim())) {
        ctx.report('error', 'image-invalid-src', 'Image is embedded as a data: URL. Upload it and use its https URL.', img);
    } else if (!isAllowedImageSrc(src, ctx.options.delimiters)) {
        ctx.report('error', 'image-invalid-src', `Image source "${src.trim()}" must be an absolute https URL.`, img);
    }
    const width = Number(img.getAttribute('width'));
    const height = Number(img.getAttribute('height'));
    if (!(width > 0) || !(height > 0)) {
        // Without a size there is no layout either; that is one problem, not two.
        ctx.report('error', 'image-missing-size', 'Image needs a width and a height. Resize it in the editor, or supply its size with getImageSize.', img);
    } else if (!img.getAttribute('layout')) {
        ctx.report('error', 'invalid-attribute', 'Image needs a layout.', img);
    }
}

function checkForm(form: Element, ctx: AmpContext): void {
    const action = form.getAttribute('action-xhr');
    if (!action) {
        ctx.report('error', 'invalid-attribute', 'A form needs an action-xhr endpoint.', form);
    } else if (protocolOf(action) !== 'https:') {
        ctx.report('error', 'invalid-url', `Form endpoint "${action}" must be an absolute https URL.`, form);
    }
}

function checkAccordion(acc: Element, ctx: AmpContext): void {
    for (const section of Array.from(acc.children)) {
        const parts = Array.from(section.children);
        const valid = section.tagName === 'SECTION' &&
            parts.length === 2 &&
            /^(H[1-6]|HEADER)$/.test(parts[0].tagName);
        if (!valid) {
            ctx.report('error', 'invalid-accordion', 'Each accordion section needs exactly a heading and one content element.', section);
        }
    }
}

/** Reports every element and attribute in `root` that breaks the rules above. */
export function validateAmp(root: ParentNode, ctx: AmpContext): void {
    for (const el of Array.from(root.querySelectorAll('*'))) {
        const tag = el.tagName;
        const inForm = FORM_TAGS.has(tag) && el.closest('form') !== null;
        if (!ALLOWED_TAGS.has(tag) && !GENERATED_TAGS.has(tag) && !inForm) {
            ctx.report('error', 'invalid-element', FORM_TAGS.has(tag)
                ? `<${tag.toLowerCase()}> is only allowed inside a form.`
                : `<${tag.toLowerCase()}> is not allowed in AMP email.`, el);
            continue;
        }
        for (const attr of Array.from(el.attributes)) {
            if (!isAllowedAttribute(tag, attr.name, attr.value) && !isGeneratedAttribute(tag, attr.name, attr.value)) {
                ctx.report('error', 'invalid-attribute', `Attribute ${attr.name}="${attr.value}" is not allowed on <${tag.toLowerCase()}>.`, el);
            }
        }
        const name = el.getAttribute('name');
        if (inForm && name && RESERVED_FIELD_NAME.test(name)) {
            ctx.report('error', 'invalid-attribute', `Field name "${name}" is reserved by AMP.`, el);
        }
        if (tag === 'A') checkLink(el, ctx);
        else if (tag === 'AMP-IMG') checkImage(el, ctx);
        else if (tag === 'AMP-ACCORDION') checkAccordion(el, ctx);
        else if (tag === 'FORM') checkForm(el, ctx);
    }
}
