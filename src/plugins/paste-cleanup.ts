import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { hardenedIframe } from './media';

/*
 * A paste is a ditto: what lands should look exactly like what was copied —
 * another template, a web page, an email, a document. So the cleaner keeps
 * everything that is formatting (every inline style, the presentational
 * attributes email layouts are built from, the editor's own blocks and chips)
 * and removes only what is dangerous (scripts, event handlers, script URLs) or
 * is clipboard and Office plumbing rather than formatting.
 *
 * An allowlist of styles was tried first and lost something on every template:
 * a list's indent, a button's padding and radius, an icon's vertical-align, a
 * footer cell's align="center".
 */

const ALLOWED_TAGS = new Set([
    'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'MARK', 'SMALL', 'BIG', 'CENTER',
    'A', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'IMG', 'IFRAME', 'HR', 'SUP', 'SUB', 'SPAN', 'TIME', 'DETAILS', 'SUMMARY', 'FIGURE', 'FIGCAPTION',
]);

/** Layout containers, kept as the plain block they render as. */
const BLOCK_TAGS = new Set(['SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE']);

/** Removed with their content: never formatting, and some of them execute. */
const DROPPED_TAGS = /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|XML|META|LINK|TITLE|BASE|OBJECT|EMBED|FRAME|FRAMESET|INPUT|SELECT|TEXTAREA|SVG|MATH)$/;

/** Presentational attributes email layouts are built from, and the values each may take. */
const LAYOUT_ATTRS: Record<string, RegExp> = {
    align: /^(left|right|center|justify|top|middle|bottom)$/i,
    valign: /^(top|middle|bottom|baseline)$/i,
    width: /^\d+(\.\d+)?(%|px)?$/,
    height: /^\d+(\.\d+)?(%|px)?$/,
    bgcolor: /^(#[0-9a-f]{3,8}|[a-z]+)$/i,
    cellpadding: /^\d+$/, cellspacing: /^\d+$/, border: /^\d+$/,
    colspan: /^\d+$/, rowspan: /^\d+$/, span: /^\d+$/,
    dir: /^(ltr|rtl|auto)$/i,
};

/** The editor's own markup: blocks and chips are recognised by these classes. */
const EDITOR_CLASS = /^play-editor-[a-z0-9-]+$/;

/**
 * Stands in for contenteditable="false" while the paste is inserted. Chrome's
 * insertHTML drops a non-editable element and everything after it in its
 * block, so a pasted chip or button block would take the rest of the paste
 * with it. Restored by {@link restoreNonEditable} once the content is in.
 */
const NON_EDITABLE = 'data-pe-non-editable';

/**
 * Inherited properties. A pasted value equal to what the element would inherit
 * where it lands changes nothing on screen, and is the bulk of the
 * "interchange" styles a browser wraps around every copy (the source page's
 * font, colour, letter spacing…), so it is dropped rather than repeated on
 * every node.
 */
const INHERITED_PROPS = [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-caps', 'font-variant-ligatures',
    'color', 'line-height', 'text-align', 'text-indent', 'text-transform', 'letter-spacing', 'word-spacing',
    'white-space', 'orphans', 'widows',
];
const INHERITED = new Set(INHERITED_PROPS);

/** Never carried: Office and vendor internals, and positioning that could lift content out of the editor. */
const DROPPED_PROPS = /^(mso-|-webkit-|-moz-|-ms-|position$|z-index$|top$|right$|bottom$|left$|inset)/;
const NO_OP_VALUE = /^(initial|inherit|unset|revert)$/i;
// A backslash is a CSS escape, which could spell any of the rest past this check.
const UNSAFE_VALUE = /\\|expression\s*\(|javascript:|vbscript:|behavior\s*:/i;

/** No script, and every url() points at the web or is an inline image. */
function isSafeCssValue(value: string): boolean {
    if (UNSAFE_VALUE.test(value)) return false;
    const urls = Array.from(value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi));
    if (urls.length !== (value.match(/url\(/gi) || []).length) return false;
    return urls.every(m => /^(https?:|data:image\/)/i.test(m[2].trim()));
}

/** What text looks like at a point: the computed values of the inherited properties, and what it sits on. */
export type Typography = Record<string, string> & { background: string };

/** Legacy `<font size>` 1–7, as browsers render them. */
const FONT_SIZE_PX: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px' };

const TRANSPARENT = /^(transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/i;

/** Reads the typography text inherits at `el` in the live document. */
export function typographyAt(el: Element): Typography {
    const cs = getComputedStyle(el);
    // Background isn't inherited — what text "sits on" is the nearest opaque one.
    let background = 'rgb(255, 255, 255)';
    for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && !TRANSPARENT.test(bg)) { background = bg; break; }
    }
    const out: Typography = { background };
    for (const prop of INHERITED_PROPS) out[prop] = cs.getPropertyValue(prop);
    return out;
}

/**
 * A style attribute's declarations as written. Going through the CSSOM instead
 * would split shorthands into longhands, and email clients that know
 * `text-decoration: none` don't all know `text-decoration-line: none`.
 */
function declarations(style: string): { prop: string; value: string }[] {
    const out: { prop: string; value: string }[] = [];
    let depth = 0, quote = '', start = 0;
    for (let i = 0; i <= style.length; i++) {
        const ch = style[i];
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (i === style.length || (ch === ';' && depth === 0)) {
            const decl = style.slice(start, i);
            start = i + 1;
            const colon = decl.indexOf(':');
            if (colon > 0) out.push({ prop: decl.slice(0, colon).trim().toLowerCase(), value: decl.slice(colon + 1).trim() });
        }
    }
    return out;
}

/**
 * Keeps every pasted declaration that is formatting, as written, and returns
 * what the element's children will inherit. Inherited values that merely
 * restate the paste point, and a background the text already sits on, are
 * dropped as noise.
 */
function filterStyle(el: HTMLElement, inherited: Typography): Typography {
    // Validates each declaration and gives its normalised value to compare with.
    const probe = el.ownerDocument.createElement('span').style;
    const kept: string[] = [];
    const next: Typography = { ...inherited };
    // A link is painted by the stylesheet (and by email clients), not by what it
    // inherits, so its colour is never "the same as its parent's".
    const isLink = el.tagName === 'A';

    for (const { prop, value } of declarations(el.getAttribute('style') || '')) {
        const important = /!\s*important$/i.test(value);
        const bare = value.replace(/!\s*important$/i, '').trim();
        if (!bare || NO_OP_VALUE.test(bare) || DROPPED_PROPS.test(prop) || !isSafeCssValue(bare)) continue;

        if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports(prop, bare)) continue; // not CSS a browser accepts
        probe.setProperty(prop, bare);
        const normal = probe.getPropertyValue(prop).trim();
        if (!normal) continue;

        if (INHERITED.has(prop)) {
            next[prop] = normal;
            if (normal === inherited[prop] && !(isLink && prop === 'color')) continue;
        } else if (prop === 'background-color') {
            if (TRANSPARENT.test(normal) || normal === inherited.background) continue;
            next.background = normal;
        }
        kept.push(`${prop}: ${bare}${important ? ' !important' : ''}`);
    }

    if (kept.length) el.setAttribute('style', kept.join('; '));
    else el.removeAttribute('style');
    return next;
}

/**
 * Whether a URL may be kept: relative, or a scheme that can't run script. The
 * scheme is read by the browser's own URL parser, which strips the tabs,
 * newlines and leading control characters that would hide `java\tscript:`
 * from a pattern match.
 */
function isSafeUrl(value: string, image: boolean): boolean {
    let url: URL;
    try { url = new URL(value, 'https://paste.invalid/'); } catch { return false; }
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return true;
    return image && (url.protocol === 'cid:' || /^data:image\/(png|gif|jpe?g|webp|svg\+xml)[;,]/i.test(url.href));
}

function keepAttr(el: Element, name: string, value: string): boolean {
    if (name === 'style' || name === 'class' || name === 'contenteditable') return true; // handled separately
    if (name in LAYOUT_ATTRS) return LAYOUT_ATTRS[name].test(value.trim());
    if (name === 'title' || name === 'data-token' || name === 'data-user-id') return true;
    switch (el.tagName) {
        case 'A': return name === 'target' || name === 'rel' || name === 'data-href-token' || (name === 'href' && isSafeUrl(value, false));
        case 'IMG': return name === 'alt' || (name === 'src' && isSafeUrl(value, true));
        case 'TIME': return name === 'datetime';
        case 'DETAILS': return name === 'open';
        case 'OL': return name === 'start' || name === 'type' || name === 'reversed';
        case 'LI': return name === 'value';
        default: return false;
    }
}

function cleanAttributes(el: HTMLElement): void {
    for (const a of Array.from(el.attributes)) if (!keepAttr(el, a.name, a.value)) el.removeAttribute(a.name);

    const editorClasses = Array.from(el.classList).filter(c => EDITOR_CLASS.test(c));
    if (editorClasses.length) el.setAttribute('class', editorClasses.join(' '));
    else el.removeAttribute('class');

    if (el.getAttribute('contenteditable') === 'false' && editorClasses.length) el.setAttribute(NON_EDITABLE, '');
    el.removeAttribute('contenteditable');
}

function unwrap(el: Element): void {
    const parent = el.parentNode!;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}

function rename(el: Element, tag: string): HTMLElement {
    const doc = el.ownerDocument;
    const out = doc.createElement(tag);
    for (const a of Array.from(el.attributes)) out.setAttribute(a.name, a.value);
    while (el.firstChild) out.appendChild(el.firstChild);
    el.parentNode!.replaceChild(out, el);
    return out;
}

function cleanChildren(parent: Element, inherited: Typography): void {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        let el = node as HTMLElement;
        const name = el.tagName.toUpperCase(); // SVG and MathML keep their tag names lower-case

        if (DROPPED_TAGS.test(name) || name.includes(':')) { el.remove(); continue; }

        // Chrome marks a copy that starts or ends at a paragraph boundary with
        // this <br>. Stripped of its class it reads as a real line break, and
        // lands as a blank line at the top of the first pasted block.
        if (name === 'BR' && el.classList.contains('Apple-interchange-newline')) { el.remove(); continue; }

        if (name === 'IFRAME') {
            if (!/^https?:/i.test(el.getAttribute('src') || '')) { el.remove(); continue; }
            el.replaceWith(hardenedIframe(el.ownerDocument, el));
            continue;
        }

        if (BLOCK_TAGS.has(name)) el = rename(el, 'div');

        // <font> is how this editor's own colour tool writes colour, so it must
        // survive a paste — as a span, carrying what its attributes meant.
        if (name === 'FONT') {
            const face = el.getAttribute('face');
            const color = el.getAttribute('color');
            const size = FONT_SIZE_PX[el.getAttribute('size') || ''];
            el = rename(el, 'span');
            for (const a of Array.from(el.attributes)) if (a.name !== 'style') el.removeAttribute(a.name);
            if (face) el.style.setProperty('font-family', face);
            if (color) el.style.setProperty('color', color);
            if (size) el.style.setProperty('font-size', size);
        }

        // An unknown inline element that carries formatting becomes a span
        // rather than being unwrapped, or the formatting goes with it.
        if (!ALLOWED_TAGS.has(el.tagName) && el.getAttribute('style')) el = rename(el, 'span');

        const tag = el.tagName;
        cleanAttributes(el);
        const childInherits = filterStyle(el, inherited);

        cleanChildren(el, childInherits);

        if (!ALLOWED_TAGS.has(tag) || (tag === 'SPAN' && el.attributes.length === 0)) unwrap(el);
    }
}

/**
 * Cleans pasted HTML: drops what is dangerous or plumbing, keeps all the
 * formatting. `context` is the typography at the paste point; inherited
 * declarations that merely restate it are dropped as noise.
 */
export function cleanHtml(html: string, context: Typography): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    cleanChildren(doc.body, context);
    return doc.body.innerHTML;
}

/** Makes the editor's pasted blocks and chips non-editable again, once insertHTML has put them in. */
export function restoreNonEditable(root: Element): boolean {
    const marked = root.querySelectorAll(`[${NON_EDITABLE}]`);
    marked.forEach(el => {
        el.removeAttribute(NON_EDITABLE);
        el.setAttribute('contenteditable', 'false');
    });
    return marked.length > 0;
}

export const PasteCleanupPlugin: Plugin = {
    name: 'paste-cleanup',
    init(editor: Editor) {
        const pasteHandler = (e: ClipboardEvent) => {
            if (!e.clipboardData) return;

            // Let PasteImagePlugin handle image pastes
            const items = Array.from(e.clipboardData.items);
            if (items.some(item => item.type.startsWith('image/'))) return;

            const html = e.clipboardData.getData('text/html');
            if (!html) return; // Plain text pastes are fine as-is

            e.preventDefault();

            const sel = window.getSelection();
            let at: Node | null = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
            if (at && at.nodeType !== Node.ELEMENT_NODE) at = at.parentNode;
            const contextEl = at instanceof Element && editor.editorArea.contains(at) ? at : editor.editorArea;

            editor.execCommand('insertHTML', cleanHtml(html, typographyAt(contextEl)));
            if (restoreNonEditable(editor.editorArea)) editor.notifyContentChange();
        };

        const keydownHandler = (e: KeyboardEvent) => {
            // Ctrl+Shift+V = paste as plain text
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'v') {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        editor.execCommand('insertText', text);
                    }
                }).catch(() => {
                    // Clipboard API not available, silently fail
                });
            }
        };

        editor.editorArea.addEventListener('paste', pasteHandler);
        editor.editorArea.addEventListener('keydown', keydownHandler);

        editor.onDestroy(() => {
            editor.editorArea.removeEventListener('paste', pasteHandler);
            editor.editorArea.removeEventListener('keydown', keydownHandler);
        });
    }
};
