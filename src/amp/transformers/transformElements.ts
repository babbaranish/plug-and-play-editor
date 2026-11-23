import type { AmpContext, AmpTransformer } from '../types';
import { ALLOWED_TAGS, DROPPED_TAGS, isAllowedAttribute } from '../validation/validateAmp';
import { UNSAFE_CSS } from '../validation/validateCss';
import { parseStyle, stringifyStyle, type Declaration } from '../utils/collectCss';
import { rename, unwrap } from '../utils/parseHtml';

/** Legacy `<font size>` 1–7, as browsers render them. */
const FONT_SIZE_PX: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px' };

/** Attributes only the editor uses; dropped without a warning. */
const EDITOR_ATTRS = new Set(['contenteditable', 'spellcheck', 'draggable', 'tabindex']);

const BLOCK_ALIGNABLE = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'SECTION', 'HEADER', 'FOOTER']);

function addStyle(el: Element, declarations: Declaration[]): void {
    const current = parseStyle(el.getAttribute('style') ?? '');
    const names = new Set(declarations.map(d => d.property));
    const merged = [...declarations, ...current.filter(d => !names.has(d.property))];
    el.setAttribute('style', stringifyStyle(merged));
}

/** The editor's own blocks and chips, which mean nothing to a recipient. */
function convertEditorMarkup(root: DocumentFragment, ctx: AmpContext): void {
    root.querySelectorAll('.play-editor-page-break').forEach(el => {
        ctx.report('warning', 'element-removed', 'Page break removed; it has no meaning in email.', el);
        el.remove();
    });
    // A variable chip becomes its text ({{key}}), which the sender substitutes;
    // a mention becomes its "@Name" text.
    root.querySelectorAll('.play-editor-token, .play-editor-mention').forEach(el => {
        el.replaceWith(ctx.doc.createTextNode(el.textContent ?? ''));
    });
}

/** Rewrites an element AMP doesn't allow into one it does, or removes it. Returns the element to keep working on, or null. */
function convertTag(el: Element, ctx: AmpContext): Element | null {
    switch (el.tagName) {
        case 'FONT': {
            const decl: Declaration[] = [];
            const color = el.getAttribute('color');
            const face = el.getAttribute('face');
            const size = el.getAttribute('size');
            if (color) decl.push({ property: 'color', value: color, important: false });
            if (face) decl.push({ property: 'font-family', value: face, important: false });
            if (size && FONT_SIZE_PX[size.trim()]) decl.push({ property: 'font-size', value: FONT_SIZE_PX[size.trim()], important: false });
            ['color', 'face', 'size'].forEach(a => el.removeAttribute(a));
            const span = rename(el, 'span');
            if (decl.length) addStyle(span, decl);
            return span;
        }
        case 'STRIKE':
            return rename(el, 's');
        case 'CENTER': {
            const div = rename(el, 'div');
            addStyle(div, [{ property: 'text-align', value: 'center', important: false }]);
            return div;
        }
        case 'BIG': {
            const span = rename(el, 'span');
            addStyle(span, [{ property: 'font-size', value: 'larger', important: false }]);
            return span;
        }
        case 'TIME':
            return rename(el, 'span');
        case 'DETAILS':
        case 'SUMMARY':
            return rename(el, 'div');
    }

    if (ALLOWED_TAGS.has(el.tagName)) return el;

    if (DROPPED_TAGS.has(el.tagName)) {
        ctx.report('warning', 'element-removed', `<${el.tagName.toLowerCase()}> removed; AMP email does not allow it.`, el);
        el.remove();
        return null;
    }

    ctx.report('warning', 'element-unwrapped', `<${el.tagName.toLowerCase()}> is not allowed in AMP email; its content is kept.`, el);
    unwrap(el);
    return null;
}

function cleanClasses(el: Element): void {
    const keep = Array.from(el.classList).filter(c => !c.startsWith('play-editor-') && !/^(-amp-|i-amp)/.test(c));
    if (keep.length) el.setAttribute('class', keep.join(' '));
    else el.removeAttribute('class');
}

function cleanStyle(el: Element, ctx: AmpContext): void {
    const style = el.getAttribute('style');
    if (style === null) return;
    const declarations = parseStyle(style);
    let important = false;
    let unsafe = false;
    const kept: Declaration[] = [];
    for (const d of declarations) {
        if (UNSAFE_CSS.test(d.value) || UNSAFE_CSS.test(`${d.property}:`)) {
            unsafe = true;
            continue;
        }
        if (d.important) important = true;
        kept.push({ ...d, important: false });
    }
    if (important) ctx.report('warning', 'css-important-removed', '!important removed from an inline style; AMP email does not allow it.', el);
    if (unsafe) ctx.report('warning', 'css-unsafe-removed', 'Unsafe declaration removed from an inline style.', el);
    if (kept.length) el.setAttribute('style', stringifyStyle(kept));
    else el.removeAttribute('style');
}

function cleanAttributes(el: Element, ctx: AmpContext): void {
    const tag = el.tagName;

    // align on a block is a text-align in AMP.
    const align = el.getAttribute('align');
    if (align && BLOCK_ALIGNABLE.has(tag) && /^(left|right|center|justify)$/i.test(align.trim())) {
        addStyle(el, [{ property: 'text-align', value: align.trim().toLowerCase(), important: false }]);
        el.removeAttribute('align');
    }

    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (EDITOR_ATTRS.has(name) || name.startsWith('data-')) {
            el.removeAttribute(attr.name);
            continue;
        }
        if (name === 'class' || name === 'style') continue;
        if (!isAllowedAttribute(tag, name, attr.value)) {
            ctx.report('warning', 'attribute-removed', `Attribute ${name}="${attr.value}" removed from <${tag.toLowerCase()}>; AMP email does not allow it.`, el);
            el.removeAttribute(attr.name);
        }
    }

    cleanClasses(el);
    cleanStyle(el, ctx);
}

/**
 * The general pass, run after the block transformers: removes the editor's
 * own markup, rewrites or removes elements AMP doesn't allow, and keeps only
 * the attributes and styles it does.
 */
export const transformElements: AmpTransformer = (root, ctx) => {
    convertEditorMarkup(root, ctx);
    for (const original of Array.from(root.querySelectorAll('*'))) {
        // Skip what an earlier step already removed (e.g. inside a dropped element),
        // and finished markup a block pass produced (e.g. a generated form).
        if (!root.contains(original) || ctx.isFinalized(original)) continue;
        const el = convertTag(original, ctx);
        if (el) cleanAttributes(el, ctx);
    }
};
