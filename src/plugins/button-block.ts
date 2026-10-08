import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal, openInfoModal } from '../core/modal';
import type { Token } from './tokens';
import { DEFAULT_EMAIL_TOKENS, DELIMITER_MAP } from './tokens';
import {
    anchorDestinationState,
    canonicalHrefToken,
    destinationKeyOf,
    isTokenKeyShaped,
    mayHoldTokenDestination,
    readTokenSource,
    resolveEmbeddedTokens,
    tokenDisplayText,
    tokenOnlyUrl,
    tokenReferenceMatches,
    tokenUrlHint
} from './links';
import type { ExactToken } from './links';

export interface ButtonBlockPluginOptions {
    /** Variables offered by the "insert variable" picker on the Text/URL fields */
    tokens?: Token[] | (() => Token[]);
    acceptTokens?: Token[] | (() => Token[]);
    isDestinationToken?: (key: string) => boolean;
    /** Delimiter style — must match how those tokens get replaced elsewhere (default "double-curly") */
    delimiter?: 'double-curly' | 'single-curly' | 'percent';
}

export const BUTTON_BLOCK_OPEN_COMMAND = 'button-block:open';
export const BUTTON_BLOCK_CANONICALIZE_COMMAND = 'button-block:canonicalize';

export interface ButtonDialogRequest {
    text?: string;
    url?: string;
    token?: { key: string; label?: string };
    bgColor?: string;
    textColor?: string;
    borderRadius?: number;
    paddingV?: number;
    paddingH?: number;
    range?: Range | null;
    replace?: Element | null;
}

export function openButtonDialog(editor: Editor, request?: ButtonDialogRequest): boolean {
    if (!editor.hasCommand(BUTTON_BLOCK_OPEN_COMMAND)) return false;
    editor.runCommand(BUTTON_BLOCK_OPEN_COMMAND, request ?? {});
    return true;
}

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
    } catch { return false; }
}

/**
 * Escape for use as element CONTENT.
 *
 * textContent -> innerHTML handles `&`, `<` and `>`, which is all content needs.
 */
function escapeText(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Escape for use inside a double-quoted ATTRIBUTE value.
 *
 * The content escaper is not enough here, because it leaves `"` alone: a url of
 * `https://x.test" onmouseover="alert(1)` came back unchanged, closed the href
 * it was interpolated into, and `onmouseover` was parsed as a real attribute on
 * the anchor. Verified in a browser, not reasoned about.
 *
 * Same two replacements as escapeAttrValue in source-code-format.ts, which had
 * this right; keep the two in step.
 */
function escapeAttr(str: string): string {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

interface ButtonConfig {
    text: string;
    url: string;
    bgColor: string;
    textColor: string;
    borderRadius: number;
    paddingV: number;
    paddingH: number;
    hrefToken?: string | null;
    target?: string | null;
    rel?: string | null;
}

const DEFAULT_CONFIG: ButtonConfig = {
    text: 'Click Here',
    url: 'https://',
    bgColor: '#3b82f6',
    textColor: '#ffffff',
    borderRadius: 4,
    paddingV: 12,
    paddingH: 24
};

const INERT_HREF = '#';

export function generateButtonHtmlForTest(cfg: ButtonConfig): string {
    return generateButtonHtml(cfg);
}

function generateButtonHtml(cfg: ButtonConfig): string {
    const safeText = escapeText(cfg.text);
    const safeUrl = escapeAttr(cfg.hrefToken ? INERT_HREF : cfg.url);
    const hrefToken = cfg.hrefToken ? ` data-href-token="${escapeAttr(cfg.hrefToken)}"` : '';
    const target = escapeAttr(cfg.target ?? '_blank');
    const rel = escapeAttr(cfg.rel ?? 'noopener noreferrer');
    return `<div contenteditable="false" class="play-editor-button-block" style="margin:1em 0;text-align:center;">` +
        `<a href="${safeUrl}"${hrefToken} target="${target}" rel="${rel}" ` +
        `style="display:inline-block;padding:${cfg.paddingV}px ${cfg.paddingH}px;` +
        `color:${escapeAttr(cfg.textColor)};background-color:${escapeAttr(cfg.bgColor)};` +
        `border-radius:${cfg.borderRadius}px;text-decoration:none;` +
        `font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">` +
        `${safeText}</a></div>`;
}

function createButtonBlock(cfg: ButtonConfig): HTMLElement {
    const holder = document.createElement('template');
    holder.innerHTML = generateButtonHtml(cfg);
    return holder.content.firstElementChild as HTMLElement;
}

function rgbToHex(input: string): string {
    if (!input) return '';
    if (input.startsWith('#')) return input;
    const m = input.match(/\d+/g);
    if (!m || m.length < 3) return input;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return '#' + toHex(parseInt(m[0])) + toHex(parseInt(m[1])) + toHex(parseInt(m[2]));
}

function hexColor(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : rgbToHex(v);
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

function safeColor(value: unknown): string | null {
    const v = typeof value === 'string' ? value.trim() : '';
    return v && /^[#a-z0-9(),.%\s]+$/i.test(v) ? v : null;
}

function intOr(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function parseButtonBlock(el: HTMLElement): ButtonConfig {
    const a = el.querySelector('a');
    if (!a) return { ...DEFAULT_CONFIG };
    const s = a.style;
    return {
        text: (a.textContent || '').trim() || DEFAULT_CONFIG.text,
        url: a.getAttribute('href') || DEFAULT_CONFIG.url,
        bgColor: rgbToHex(s.backgroundColor) || DEFAULT_CONFIG.bgColor,
        textColor: rgbToHex(s.color) || DEFAULT_CONFIG.textColor,
        borderRadius: intOr(s.borderRadius, DEFAULT_CONFIG.borderRadius),
        paddingV: intOr(s.paddingTop || s.padding, DEFAULT_CONFIG.paddingV),
        paddingH: intOr(s.paddingLeft || s.padding, DEFAULT_CONFIG.paddingH),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel')
    };
}

function configFromRequest(request: ButtonDialogRequest): ButtonConfig {
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    const url = typeof request.url === 'string' ? request.url.trim() : '';
    return {
        ...DEFAULT_CONFIG,
        text: text || DEFAULT_CONFIG.text,
        url: url || DEFAULT_CONFIG.url,
        bgColor: hexColor(request.bgColor) ?? DEFAULT_CONFIG.bgColor,
        textColor: hexColor(request.textColor) ?? DEFAULT_CONFIG.textColor,
        borderRadius: intOr(request.borderRadius, DEFAULT_CONFIG.borderRadius),
        paddingV: intOr(request.paddingV, DEFAULT_CONFIG.paddingV),
        paddingH: intOr(request.paddingH, DEFAULT_CONFIG.paddingH)
    };
}

function exactFromRequest(
    token: ButtonDialogRequest['token'],
    known: Token[],
    open: string,
    close: string
): ExactToken | null {
    const key = typeof token?.key === 'string' ? token.key.trim() : '';
    if (!key) return null;
    const label = typeof token?.label === 'string' ? token.label.trim() : '';
    if (label && !label.includes(open) && !label.includes(close)) {
        const matches = tokenReferenceMatches(label, known);
        if (matches.length === 0 || (matches.length === 1 && matches[0] === key)) {
            return { key, label, display: `${open}${label}${close}` };
        }
    }
    return { key, display: tokenDisplayText(key, known, open, close) };
}

interface ButtonDialogContext {
    editor: Editor;
    config: ButtonConfig;
    editing: HTMLElement | null;
    range: Range | null;
    replace: Element | null;
    exact: ExactToken | null;
    picker: Token[];
    known: Token[];
    tokenOpen: string;
    tokenClose: string;
    isDestination: (key: string) => boolean;
}

function refuseUnknownToken(inner: string, ambiguous: boolean, ctx: ButtonDialogContext): string {
    const hasPicker = ctx.picker.length > 0;
    if (ambiguous) {
        return hasPicker
            ? `"${inner}" matches more than one variable. Pick the one you mean from the { } list beside the Button URL field.`
            : `"${inner}" matches more than one variable. Copy it exactly as it appears in the email body.`;
    }
    if (ctx.known.length === 0) {
        return `"${inner}" is not a variable, and no variables are available here yet. Close this, let the page finish loading, and try again.`;
    }
    return hasPicker
        ? `"${inner}" is not one of the variables available here. Pick it from the { } list beside the Button URL field.`
        : `"${inner}" is not one of the variables available here. Copy it exactly as it appears in the email body.`;
}

function resolveButtonUrl(url: string, ctx: ButtonDialogContext): { url: string; hrefToken: string | null } | string {
    const { tokenOpen, tokenClose } = ctx;
    const inner = tokenOnlyUrl(url, tokenOpen, tokenClose);
    if (inner === null) {
        const embedded = resolveEmbeddedTokens(url, ctx.known, tokenOpen, tokenClose, ctx.exact);
        if (!isValidUrl(embedded.url)) {
            return `Enter a link starting with http, https or mailto, or a single variable such as ${tokenOpen}login_url${tokenClose}.`;
        }
        if (embedded.unknown) return refuseUnknownToken(embedded.unknown.name, embedded.unknown.ambiguous, ctx);
        return { url: embedded.url, hrefToken: null };
    }
    let key: string;
    if (ctx.exact && url === ctx.exact.display) {
        key = ctx.exact.key;
    } else {
        const matches = tokenReferenceMatches(inner, ctx.known);
        if (matches.length === 1) key = matches[0];
        else if (matches.length === 0 && isTokenKeyShaped(inner)) key = inner;
        else return refuseUnknownToken(inner, matches.length > 1, ctx);
    }
    return ctx.isDestination(key)
        ? { url: INERT_HREF, hrefToken: key }
        : { url: `${tokenOpen}${key}${tokenClose}`, hrefToken: null };
}

const PARAGRAPH_TAG = /^(P|H[1-6])$/;
const CONTAINER_TAG = /^(P|H[1-6]|DIV|TD|TH|LI|DD|DT|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|FIGURE|FIGCAPTION|DETAILS|SUMMARY|CENTER|TABLE|THEAD|TBODY|TFOOT|TR|UL|OL|DL|FORM)$/;
const STRUCTURE_TAG = /^(TABLE|THEAD|TBODY|TFOOT|TR|UL|OL|DL)$/;
const INLINE_TAG = /^(A|SPAN|B|STRONG|I|EM|U|S|STRIKE|DEL|INS|FONT|SMALL|BIG|SUB|SUP|CODE|MARK|LABEL|ABBR|CITE|Q|TIME|TT|KBD|SAMP|VAR)$/;
const CONTENT_SELECTOR = 'img, iframe, video, audio, hr, table, input, svg, .play-editor-token, .play-editor-mention, .play-editor-button-block';
const CHIP_SELECTOR = '.play-editor-token';

interface Point {
    node: Node;
    offset: number;
}

function hasContent(node: Element | DocumentFragment): boolean {
    if ((node.textContent ?? '').replace(/[\s\u00a0\u200b]/g, '')) return true;
    return node.querySelector(CONTENT_SELECTOR) !== null;
}

function indexIn(parent: Node, child: Node): number {
    return Array.prototype.indexOf.call(parent.childNodes, child);
}

function elementOf(node: Node): Element | null {
    return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function outermost(node: Node, stop: Node, test: (el: Element) => boolean): Element | null {
    let found: Element | null = null;
    for (let el = elementOf(node); el && el !== stop; el = el.parentElement) {
        if (test(el)) found = el;
    }
    return found;
}

function closestWithin(node: Node, stop: Node, test: (el: Element) => boolean): Element | null {
    for (let el = elementOf(node); el && el !== stop; el = el.parentElement) {
        if (test(el)) return el;
    }
    return null;
}

function isAtStart(el: Element, point: Point): boolean {
    const r = document.createRange();
    try {
        r.setStart(el, 0);
        r.setEnd(point.node, point.offset);
    } catch {
        return false;
    }
    return !hasContent(r.cloneContents());
}

function rangeInside(area: HTMLElement, range: Range): boolean {
    return area.contains(range.startContainer) && area.contains(range.endContainer);
}

function detach(area: HTMLElement, el: Element): Point {
    let node: Node = el.parentNode as Node;
    let offset = indexIn(node, el);
    el.remove();
    while (node !== area && node.nodeType === Node.ELEMENT_NODE) {
        const wrapper = node as Element;
        if (!INLINE_TAG.test(wrapper.tagName) || hasContent(wrapper)) break;
        const parent = wrapper.parentNode as Node;
        offset = indexIn(parent, wrapper);
        wrapper.remove();
        node = parent;
    }
    return { node, offset };
}

const CARET_HOLDER_TAG = /^(TD|TH|DIV|LI|BLOCKQUOTE)$/;

function endsItsContainer(block: HTMLElement): boolean {
    for (let n = block.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType !== Node.TEXT_NODE || !/^[ \t\n\r\f]*$/.test(n.textContent ?? '')) return false;
    }
    return true;
}

function placeCaretAfter(editor: Editor, block: HTMLElement): void {
    const sel = window.getSelection();
    editor.editorArea.focus({ preventScroll: true });
    if (!sel) return;
    const caret = document.createRange();
    const next = block.nextSibling;
    if (next && next.nodeType === Node.ELEMENT_NODE && PARAGRAPH_TAG.test((next as Element).tagName)) {
        caret.setStart(next, 0);
    } else {
        caret.setStartAfter(block);
    }
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
}

function insertButtonBlock(editor: Editor, block: HTMLElement, range: Range | null, replace: Element | null): void {
    const area = editor.editorArea;
    let point: Point;
    if (replace && replace !== area && area.contains(replace)) {
        point = detach(area, replace);
    } else if (range && rangeInside(area, range)) {
        point = { node: range.endContainer, offset: range.endOffset };
    } else {
        point = { node: area, offset: area.childNodes.length };
    }

    const trap = outermost(point.node, area, (el) => el.tagName === 'A' || el.getAttribute('contenteditable') === 'false');
    if (trap && trap.parentNode) point = { node: trap.parentNode, offset: indexIn(trap.parentNode, trap) + 1 };

    let holder = closestWithin(point.node, area, (el) => CONTAINER_TAG.test(el.tagName));
    while (holder && STRUCTURE_TAG.test(holder.tagName)) {
        const whole = holder.closest('table, ul, ol, dl') ?? holder;
        if (!whole.parentNode) break;
        point = { node: whole.parentNode, offset: indexIn(whole.parentNode, whole) + 1 };
        holder = closestWithin(point.node, area, (el) => CONTAINER_TAG.test(el.tagName));
    }
    if (holder && PARAGRAPH_TAG.test(holder.tagName)) {
        if (!hasContent(holder) || isAtStart(holder, point)) holder.before(block);
        else holder.after(block);
    } else {
        const inline = outermost(point.node, holder ?? area, (el) => INLINE_TAG.test(el.tagName));
        if (inline) {
            if (isAtStart(inline, point)) inline.before(block);
            else inline.after(block);
        } else {
            const at = document.createRange();
            at.setStart(point.node, point.offset);
            at.collapse(true);
            at.insertNode(block);
        }
    }

    const parent = block.parentElement;
    if (parent && (parent === area || CARET_HOLDER_TAG.test(parent.tagName)) && endsItsContainer(block)) {
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        block.after(p);
    }
    placeCaretAfter(editor, block);
}

function selectedChip(area: HTMLElement, range: Range): HTMLElement | null {
    const chips = Array.from(area.querySelectorAll<HTMLElement>(CHIP_SELECTOR)).filter(
        (c) => (c.hasAttribute('data-token') || c.hasAttribute('data-key')) && range.intersectsNode(c)
    );
    if (chips.length !== 1) return null;
    const chip = chips[0];
    if (chip.contains(range.startContainer) && chip.contains(range.endContainer)) return chip;
    if (range.collapsed) return null;
    const rest = range.cloneContents();
    rest.querySelectorAll(CHIP_SELECTOR).forEach((c) => c.remove());
    return hasContent(rest) ? null : chip;
}

function chipToken(chip: HTMLElement, open: string, close: string): { key: string; label?: string } {
    const key = (chip.getAttribute('data-token') || chip.getAttribute('data-key') || '').trim();
    const text = (chip.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const label = tokenOnlyUrl(text, open, close) ?? text;
    return { key, label: label && label !== key ? label : undefined };
}

function openButtonModal(ctx: ButtonDialogContext) {
    const { editor, config, editing, exact, picker, known, tokenOpen, tokenClose } = ctx;
    const tokenPicker = { list: picker, open: tokenOpen, close: tokenClose };

    openFormModal(editor, {
        title: editing ? 'Edit Button' : 'Insert Button',
        submitLabel: editing ? 'Update Button' : 'Insert Button',
        fields: [
            { name: 'text', label: 'Button Text', type: 'text', value: config.text, placeholder: 'Click Here', tokens: tokenPicker },
            {
                name: 'url',
                label: 'Button URL',
                type: 'url',
                value: exact ? exact.display : config.url,
                placeholder: 'https://example.com',
                tokens: {
                    ...tokenPicker,
                    pasteText: (key: string, label: string) => tokenDisplayText(key, known, tokenOpen, tokenClose, label)
                },
                hint: (value: string) => tokenUrlHint(value, {
                    tokens: known,
                    open: tokenOpen,
                    close: tokenClose,
                    exact,
                    pickerHasItems: picker.length > 0,
                    keepUnknownKeys: true
                })
            },
            [
                { name: 'bgColor', label: 'Background', type: 'color', value: config.bgColor },
                { name: 'textColor', label: 'Text Color', type: 'color', value: config.textColor }
            ],
            [
                { name: 'borderRadius', label: 'Radius', type: 'number', value: String(config.borderRadius), min: 0, max: 50 },
                { name: 'paddingV', label: 'Padding V', type: 'number', value: String(config.paddingV), min: 0, max: 80 },
                { name: 'paddingH', label: 'Padding H', type: 'number', value: String(config.paddingH), min: 0, max: 80 }
            ]
        ],
        onSubmit: (values, { showError, close }) => {
            const destination = resolveButtonUrl(values.url.trim(), ctx);
            if (typeof destination === 'string') {
                showError(destination);
                return;
            }

            const cfg: ButtonConfig = {
                text: values.text.trim() || DEFAULT_CONFIG.text,
                url: destination.url,
                hrefToken: destination.hrefToken,
                bgColor: safeColor(values.bgColor) ?? DEFAULT_CONFIG.bgColor,
                textColor: safeColor(values.textColor) ?? DEFAULT_CONFIG.textColor,
                borderRadius: intOr(values.borderRadius, DEFAULT_CONFIG.borderRadius),
                paddingV: intOr(values.paddingV, DEFAULT_CONFIG.paddingV),
                paddingH: intOr(values.paddingH, DEFAULT_CONFIG.paddingH),
                target: config.target,
                rel: config.rel
            };
            const block = createButtonBlock(cfg);

            if (editing) {
                if (!editing.isConnected) {
                    close();
                    return;
                }
                editing.replaceWith(block);
            } else {
                insertButtonBlock(editor, block, ctx.range, ctx.replace);
            }
            editor.notifyContentChange();
            close();
        }
    });
}

export function createButtonBlockPlugin(options?: ButtonBlockPluginOptions): Plugin {
    const pickerTokens = (): Token[] => readTokenSource(options?.tokens ?? DEFAULT_EMAIL_TOKENS);
    const acceptedTokens = (): Token[] => readTokenSource(options?.acceptTokens);
    const isDestination = (key: string): boolean => {
        try {
            return options?.isDestinationToken
                ? Boolean(options.isDestinationToken(key))
                : acceptedTokens().some((t) => t.key === key);
        } catch {
            return false;
        }
    };
    const [tokenOpen, tokenClose] = DELIMITER_MAP[options?.delimiter || 'double-curly'];

    return {
        name: 'button-block',
        init(editor: Editor) {
            let destroyed = false;

            const inAlternateView = () =>
                editor.hasActiveContentSource() || editor.container.classList.contains('play-editor-preview-mode');

            const currentRange = (): Range | null => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return null;
                const range = sel.getRangeAt(0);
                return rangeInside(editor.editorArea, range) ? range.cloneRange() : null;
            };

            const usableRange = (range: Range | null | undefined): Range | null => {
                if (!range || typeof range.cloneRange !== 'function') return null;
                return rangeInside(editor.editorArea, range) ? range.cloneRange() : null;
            };

            const usableReplace = (el: Element | null | undefined): Element | null => {
                if (!el || el === editor.editorArea || !editor.editorArea.contains(el)) return null;
                return el.parentElement?.closest('.play-editor-button-block') ? null : el;
            };

            const contextFor = (fields: Pick<ButtonDialogContext, 'config' | 'editing' | 'range' | 'replace'>, exactOf: (known: Token[]) => ExactToken | null): ButtonDialogContext => {
                const picker = pickerTokens();
                const known = [...picker, ...acceptedTokens()];
                return {
                    editor,
                    ...fields,
                    exact: exactOf(known),
                    picker,
                    known,
                    tokenOpen,
                    tokenClose,
                    isDestination
                };
            };

            function openInsertDialog(request: ButtonDialogRequest): boolean {
                if (destroyed) return false;
                if (inAlternateView()) {
                    openInfoModal(editor, {
                        title: 'Switch back to the editing view',
                        message: 'A button can only be added in the normal editing view. Turn off the HTML source view or the preview, then try again.'
                    });
                    return false;
                }
                const ctx = contextFor(
                    {
                        config: configFromRequest(request),
                        editing: null,
                        range: usableRange(request.range) ?? currentRange(),
                        replace: usableReplace(request.replace)
                    },
                    (known) => exactFromRequest(request.token, known, tokenOpen, tokenClose)
                );
                openButtonModal(ctx);
                return true;
            }

            function openEditDialog(block: HTMLElement) {
                const config = parseButtonBlock(block);
                const a = block.querySelector('a');
                const ctx = contextFor({ config, editing: block, range: null, replace: null }, (known) => {
                    const key = a ? destinationKeyOf(a, known, tokenOpen, tokenClose) : null;
                    return key ? { key, display: tokenDisplayText(key, known, tokenOpen, tokenClose) } : null;
                });
                const stored = a?.getAttribute('data-href-token')?.trim();
                if (!ctx.exact && stored) {
                    config.url = tokenOnlyUrl(stored, tokenOpen, tokenClose) === null ? `${tokenOpen}${stored}${tokenClose}` : stored;
                }
                openButtonModal(ctx);
            }

            function canonicalize(): boolean {
                if (destroyed || inAlternateView()) return false;
                const anchors = Array.from(editor.editorArea.querySelectorAll<HTMLAnchorElement>('.play-editor-button-block a'))
                    .filter((a) => mayHoldTokenDestination(a, tokenOpen, tokenClose));
                if (anchors.length === 0) return false;
                const known = [...pickerTokens(), ...acceptedTokens()];
                let changed = false;
                anchors.forEach((a) => {
                    const key = canonicalHrefToken(a, known, tokenOpen, tokenClose, isDestination);
                    if (!key) return;
                    const before = anchorDestinationState(a);
                    if (isDestination(key)) {
                        a.setAttribute('data-href-token', key);
                        a.setAttribute('href', INERT_HREF);
                    } else {
                        a.removeAttribute('data-href-token');
                        a.setAttribute('href', `${tokenOpen}${key}${tokenClose}`);
                    }
                    if (anchorDestinationState(a) !== before) changed = true;
                });
                if (changed) editor.notifyContentChange();
                return changed;
            }

            editor.addToolbarDivider();

            editor.addToolbarButton(icons.buttonBlock, 'Insert Button', () => {
                const range = currentRange();
                const chip = range ? selectedChip(editor.editorArea, range) : null;
                openInsertDialog(chip
                    ? { token: chipToken(chip, tokenOpen, tokenClose), replace: chip, range }
                    : { range });
            });

            const editHandler = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                const block = target.closest?.('.play-editor-button-block') as HTMLElement | null;
                if (!block || !editor.editorArea.contains(block)) return;
                e.preventDefault();
                if (inAlternateView() || editor.editorArea.contentEditable === 'false') return;
                openEditDialog(block);
            };
            editor.editorArea.addEventListener('click', editHandler);

            const unregisterOpen = editor.registerCommand(
                BUTTON_BLOCK_OPEN_COMMAND,
                (request?: ButtonDialogRequest) => openInsertDialog(request ?? {})
            );
            const unregisterCanonicalize = editor.registerCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND, () => canonicalize());
            const unsubscribeInput = editor.onInput(() => {
                canonicalize();
            });
            if (canonicalize()) {
                requestAnimationFrame(() => {
                    if (!destroyed) editor.notifyContentChange();
                });
            }

            editor.onDestroy(() => {
                destroyed = true;
                unregisterOpen();
                unregisterCanonicalize();
                unsubscribeInput();
                editor.editorArea.removeEventListener('click', editHandler);
            });
        }
    };
}

/** Pre-configured button block plugin with the default email token set */
export const ButtonBlockPlugin = createButtonBlockPlugin();
