import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
    'IMG', 'HR', 'SUP', 'SUB', 'SPAN',
]);

const BLOCK_TAGS = new Set([
    'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE',
]);

/**
 * The typography a paste may carry over. Everything else in a pasted `style`
 * (mso-* junk, positioning, Chrome's interchange noise) is dropped.
 */
const INHERITED_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'line-height', 'text-align'] as const;
type InheritedProp = typeof INHERITED_PROPS[number];

/** What text looks like at a point: the computed typography it inherits. */
export type Typography = Record<InheritedProp, string> & { background: string };

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
    return {
        'font-family': cs.fontFamily, 'font-size': cs.fontSize, 'font-weight': cs.fontWeight,
        'font-style': cs.fontStyle, color: cs.color, 'line-height': cs.lineHeight,
        'text-align': cs.textAlign, background
    };
}

/**
 * Keeps only the pasted typography that actually changes how the text looks at
 * the point it lands, and returns what the element's children will inherit.
 *
 * A copy out of a rendered page (including another instance of this editor)
 * wraps the content in "interchange" styles describing the SOURCE's defaults —
 * font, size, colour, a white background. Keeping those wholesale would bake one
 * editor's theme into every paste; dropping all styles (the old behaviour) threw
 * away the author's own Georgia / 24px / red along with the noise. Comparing each
 * declaration against the value it would otherwise inherit keeps exactly the
 * formatting that is doing something.
 */
function filterStyle(el: HTMLElement, inherited: Typography): Typography {
    const src = el.style;
    const kept: string[] = [];
    const next: Typography = { ...inherited };

    for (const prop of INHERITED_PROPS) {
        const value = src.getPropertyValue(prop).trim();
        if (!value || value === 'inherit' || value === 'initial' || value === inherited[prop]) continue;
        kept.push(`${prop}: ${value}`);
        next[prop] = value;
    }

    const bg = src.getPropertyValue('background-color').trim();
    if (bg && !TRANSPARENT.test(bg) && bg !== inherited.background) {
        kept.push(`background-color: ${bg}`);
        next.background = bg;
    }

    const deco = (src.getPropertyValue('text-decoration-line') || src.getPropertyValue('text-decoration')).trim();
    if (/underline|line-through/.test(deco)) kept.push(`text-decoration: ${deco.match(/underline|line-through/g)!.join(' ')}`);

    if (kept.length) el.setAttribute('style', kept.join('; '));
    else el.removeAttribute('style');
    return next;
}

function keepAttr(tag: string, name: string): boolean {
    if (name === 'style') return true; // filtered separately
    if (tag === 'A') return name === 'href' || name === 'target' || name === 'rel' || name === 'data-href-token';
    if (tag === 'IMG') return name === 'src' || name === 'alt' || name === 'width' || name === 'height';
    return false;
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

        if (/^(STYLE|SCRIPT|XML|META|LINK|TITLE)$/.test(el.tagName) || el.tagName.includes(':')) { el.remove(); continue; }

        if (BLOCK_TAGS.has(el.tagName)) el = rename(el, 'p');

        // <font> is how this editor's own colour tool writes colour, so it must
        // survive a paste — as a span, carrying what its attributes meant.
        if (el.tagName === 'FONT') {
            const face = el.getAttribute('face');
            const color = el.getAttribute('color');
            const size = FONT_SIZE_PX[el.getAttribute('size') || ''];
            el = rename(el, 'span');
            for (const a of Array.from(el.attributes)) if (a.name !== 'style') el.removeAttribute(a.name);
            if (face) el.style.setProperty('font-family', face);
            if (color) el.style.setProperty('color', color);
            if (size) el.style.setProperty('font-size', size);
        }

        // An unknown inline element that carries typography becomes a span
        // rather than being unwrapped, or the typography goes with it.
        if (!ALLOWED_TAGS.has(el.tagName) && el.getAttribute('style')) el = rename(el, 'span');

        const tag = el.tagName;
        for (const a of Array.from(el.attributes)) if (!keepAttr(tag, a.name)) el.removeAttribute(a.name);
        const childInherits = filterStyle(el, inherited);

        cleanChildren(el, childInherits);

        if (!ALLOWED_TAGS.has(tag) || (tag === 'SPAN' && el.attributes.length === 0)) unwrap(el);
    }
}

/**
 * Cleans pasted HTML: drops junk markup and attributes, keeps the author's
 * typography. `context` is the typography at the paste point; declarations that
 * merely restate it are dropped as noise.
 */
export function cleanHtml(html: string, context: Typography): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    cleanChildren(doc.body, context);
    return doc.body.innerHTML;
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
