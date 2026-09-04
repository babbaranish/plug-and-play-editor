import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import type { Token } from './tokens';
import { DEFAULT_EMAIL_TOKENS, DELIMITER_MAP } from './tokens';

export interface LinksPluginOptions {
    /**
     * Variables offered by the "insert variable" picker on the Text/URL fields.
     *
     * Pass a function when the list is not known at mount, or depends on what
     * the document currently contains: it is called each time the dialog opens.
     * An array is captured once, which silently yields an empty picker whenever
     * the caller's data arrives asynchronously.
     */
    tokens?: Token[] | (() => Token[]);
    /**
     * Variables that are ACCEPTED when typed or pasted, but not listed in the
     * picker.
     *
     * These are two different questions. A set that is large, or generated, or
     * only meaningful in context is noise in a flat dropdown — but an author who
     * copies one out of the document must still be able to paste it in. Listing
     * everything acceptable is how a picker becomes unreadable; validating only
     * what is listed is how a legitimate paste gets refused.
     */
    acceptTokens?: Token[] | (() => Token[]);
    /** Delimiter style — must match how those tokens get replaced elsewhere (default "double-curly") */
    delimiter?: 'double-curly' | 'single-curly' | 'percent';
}

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** Schemes that can execute script or read local files if they reach an `href`. */
const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript|file)\s*:/i;

/**
 * Browsers strip tabs and newlines from a URL *anywhere* before resolving its
 * scheme, so `java<TAB>script:x` still runs as `javascript:`. Strip them the
 * same way before the scheme check, or the check is trivially bypassed.
 */
function normalizeForSchemeCheck(url: string): string {
    return url.replace(/[\t\n\r\u0000-\u001f]/g, '').trim();
}

/** Stand-in for a variable while validating. Deliberately scheme-free and path-safe. */
const TOKEN_SENTINEL = 'pe-token';

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces every `{{variable}}` run with {@link TOKEN_SENTINEL}. */
function blankTokens(url: string, open: string, close: string): string {
    const re = new RegExp(`${escapeRegex(open)}[\\s\\S]*?${escapeRegex(close)}`, 'g');
    return url.replace(re, TOKEN_SENTINEL);
}

/**
 * URL validation that tolerates variables.
 *
 * A template URL is often not a URL yet — `{{unsubscribe_url}}` only becomes one
 * after the send-time merge — so `new URL()` alone would reject exactly the input
 * this feature exists to allow. Variables are blanked out first, then whatever
 * literal text remains still has to be a safe http/https/mailto URL. A URL whose
 * *scheme* comes from a variable is accepted only when the rest is a path,
 * query or fragment, so an empty expansion can't leave a `javascript:` href.
 */
export function isValidLinkUrl(url: string, open: string, close: string): boolean {
    const raw = url.trim();
    if (!raw) return false;

    const bare = blankTokens(raw, open, close);
    if (DANGEROUS_SCHEME.test(normalizeForSchemeCheck(raw))) return false;
    if (DANGEROUS_SCHEME.test(normalizeForSchemeCheck(bare))) return false;

    if (bare.startsWith(TOKEN_SENTINEL)) {
        const rest = bare.slice(TOKEN_SENTINEL.length);
        return rest === '' || /^[/?#]/.test(rest) || !rest.includes(':');
    }

    try {
        return ALLOWED_PROTOCOLS.includes(new URL(bare).protocol);
    } catch {
        return false;
    }
}

/**
 * True when the anchor holds nothing but text, so its label can be safely
 * round-tripped through a plain text input. An anchor wrapping `<strong>` or an
 * image is left alone — the modal edits only its URL.
 */
export function isPlainTextAnchor(a: HTMLAnchorElement): boolean {
    return Array.from(a.childNodes).every(n => n.nodeType === Node.TEXT_NODE);
}

/** Replaces an anchor with its own children, leaving the text in place. */
function unwrapAnchor(a: HTMLAnchorElement): void {
    const parent = a.parentNode;
    if (!parent) return;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
    parent.normalize();
}

/**
 * Is this URL nothing but a variable, e.g. `{{payment_link}}`?
 *
 * Such a link has no address yet: whatever consumes the document supplies one
 * per recipient. Storing the variable in `href` is what breaks that, because an
 * href is text — a URL field percent-encodes it, and nothing downstream can
 * tell it from an ordinary address. Held in `data-href-token` instead, it stays
 * intact through the DOM round trip and `href` keeps an inert placeholder.
 */
export function tokenOnlyUrl(url: string, open: string, close: string): string | null {
    const trimmed = url.trim();
    if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) return null;
    const inner = trimmed.slice(open.length, trimmed.length - close.length).trim();
    // One variable and nothing else. A URL merely CONTAINING one, such as
    // `https://x.test/{{id}}`, is a real address and stays in href.
    if (!inner || inner.includes(open) || inner.includes(close)) return null;
    return inner;
}

const INERT_HREF = '#';

/**
 * Match what an author typed or pasted against the known variables, by key OR by
 * label, and return the key.
 *
 * The label is the only form visible in the document, so it is what gets copied.
 * Refusing it would be technically correct and useless. Matching is
 * case-insensitive and whitespace-tolerant because a copy out of rendered HTML
 * picks up non-breaking spaces and stray padding.
 */
export function resolveTokenReference(input: string, tokens: Token[]): string | null {
    const norm = (v: string) => v.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const wanted = norm(input);
    if (!wanted) return null;
    const byKey = tokens.find((t) => norm(t.key) === wanted);
    if (byKey) return byKey.key;
    const byLabel = tokens.filter((t) => norm(t.label) === wanted);
    // Two variables sharing a label cannot be told apart, so guessing would
    // silently point the link at the wrong one.
    return byLabel.length === 1 ? byLabel[0].key : null;
}

export function applyLinkAttrsForTest(a: HTMLAnchorElement, url: string, open: string, close: string): void {
    applyLinkAttrs(a, url, open, close);
}

function applyLinkAttrs(a: HTMLAnchorElement, url: string, open: string, close: string): void {
    const token = tokenOnlyUrl(url, open, close);
    if (token) {
        a.setAttribute('data-href-token', token);
        a.setAttribute('href', INERT_HREF);
    } else {
        // Re-pointing a token link at a real address must clear the token, or
        // the stale one wins wherever the document is resolved.
        a.removeAttribute('data-href-token');
        a.setAttribute('href', url);
    }
    if (!a.target) a.target = '_blank';
    if (!a.rel) a.rel = 'noopener noreferrer';
}

/** The URL to SHOW for a link, so editing one round trips through the dialog. */
export function displayUrlForTest(a: HTMLAnchorElement, open: string, close: string): string {
    return displayUrl(a, open, close);
}

function displayUrl(a: HTMLAnchorElement, open: string, close: string): string {
    const token = a.getAttribute('data-href-token');
    return token ? `${open}${token}${close}` : a.getAttribute('href') || '';
}

export function createLinksPlugin(options?: LinksPluginOptions): Plugin {
    const readTokens = (source: Token[] | (() => Token[]) | undefined): Token[] => {
        if (!source) return [];
        try {
            return (typeof source === 'function' ? source() : source) || [];
        } catch {
            // A throwing provider must not take the link dialog down with it.
            return [];
        }
    };
    /** Shown in the picker. */
    const resolveTokens = (): Token[] => readTokens(options?.tokens ?? DEFAULT_EMAIL_TOKENS);
    /** Accepted when typed or pasted: everything shown, plus the unlisted ones. */
    const resolveAcceptable = (): Token[] => [...resolveTokens(), ...readTokens(options?.acceptTokens)];
    const [tokenOpen, tokenClose] = DELIMITER_MAP[options?.delimiter || 'double-curly'];

    return {
        name: 'links',
        init(editor: Editor) {
            let bubble: HTMLDivElement | null = null;
            let urlLabel: HTMLSpanElement | null = null;
            let activeAnchor: HTMLAnchorElement | null = null;
            let hideTimer: ReturnType<typeof setTimeout> | null = null;

            // ── Modal ────────────────────────────────────────────────────

            /**
             * One modal serves both insert and edit. `anchor` distinguishes them:
             * editing mutates that element in place, inserting drops a new one at
             * `savedRange` (the selection is captured before the modal steals focus).
             */
            function openLinkModal(anchor: HTMLAnchorElement | null, savedRange: Range | null) {
                // Resolved per open, not per mount: a caller whose list loads
                // asynchronously, or depends on the current document, would
                // otherwise get an empty picker with no sign anything is wrong.
                const tokens = resolveTokens();
                const tokenPicker = { list: tokens, open: tokenOpen, close: tokenClose };
                const selectedText = savedRange ? savedRange.toString() : '';
                const editable = anchor ? isPlainTextAnchor(anchor) : true;
                const currentText = anchor ? anchor.textContent ?? '' : selectedText;

                const urlField = {
                    name: 'url',
                    label: 'Link URL',
                    type: 'url' as const,
                    value: anchor ? displayUrl(anchor, tokenOpen, tokenClose) : 'https://',
                    placeholder: `https://example.com  or  ${tokenOpen}unsubscribe_url${tokenClose}`,
                    tokens: tokenPicker
                };

                const fields = editable
                    ? [
                        {
                            name: 'text',
                            label: 'Link Text',
                            type: 'text' as const,
                            value: currentText,
                            placeholder: 'Click here',
                            tokens: tokenPicker
                        },
                        urlField
                    ]
                    : [urlField];

                openFormModal(editor, {
                    title: anchor ? 'Edit Link' : 'Insert Link',
                    fields,
                    submitLabel: anchor ? 'Save' : 'Insert',
                    onSubmit: (values, { showError, close }) => {
                        let url = values.url.trim();
                        if (!url) {
                            showError('URL is required.');
                            return;
                        }
                        if (!isValidLinkUrl(url, tokenOpen, tokenClose)) {
                            showError(
                                `Invalid URL. Use an http, https or mailto address, or a variable like ${tokenOpen}unsubscribe_url${tokenClose}.`
                            );
                            return;
                        }

                        // A variable must be one the picker actually offers —
                        // but an author reasonably pastes what they can SEE, and
                        // what a token chip shows is its label, not its key.
                        // Accept either and store the key, so copying a chip out
                        // of the body and pasting it here simply works. Anything
                        // that matches neither is refused rather than stored as a
                        // destination nothing can ever resolve.
                        const chosen = tokenOnlyUrl(url, tokenOpen, tokenClose);
                        if (chosen) {
                            const acceptable = resolveAcceptable();
                            const match = resolveTokenReference(chosen, acceptable);
                            if (!match) {
                                // Say WHICH way it failed. "Not a variable" reads
                                // the same whether the name is wrong or the list
                                // never loaded, and those need opposite responses
                                // from whoever is looking at the screen.
                                showError(
                                    acceptable.length === 0
                                        ? 'No variables are available here yet. Close this, let the page finish loading, and try again.'
                                        : `"${chosen}" is not one of the ${acceptable.length} variables available here. Click the ${'{ }'} button beside this field, or copy the token exactly as it appears in the email body.`
                                );
                                return;
                            }
                            url = `${tokenOpen}${match}${tokenClose}`;
                        }

                        const text = editable ? values.text.trim() : '';
                        if (editable && !text) {
                            showError('Link text is required.');
                            return;
                        }

                        if (anchor) {
                            applyLinkAttrs(anchor, url, tokenOpen, tokenClose);
                            if (editable && text !== currentText) anchor.textContent = text;
                        } else {
                            insertNewLink(url, text, selectedText, savedRange);
                        }

                        editor.notifyContentChange();
                        close();
                    }
                });
            }

            /**
             * Wraps the existing selection when the user kept its text as the label —
             * that preserves any markup inside it, which building a fresh anchor
             * would flatten. Otherwise (empty selection, or a relabelled link) a new
             * anchor is built and dropped in.
             */
            function insertNewLink(url: string, text: string, selectedText: string, savedRange: Range | null) {
                const sel = window.getSelection();
                if (savedRange) {
                    sel?.removeAllRanges();
                    sel?.addRange(savedRange);
                }
                editor.editorArea.focus();

                if (selectedText && text === selectedText) {
                    // Only the anchors execCommand actually touched. Applying to
                    // every anchor in the document re-pointed links the author
                    // never selected: insert an ordinary link into an offer letter
                    // that already carries a payment link, and applyLinkAttrs
                    // stripped `data-href-token` off the payment link and pointed
                    // it at the new address. An anchor counts as touched if it is
                    // new, or if its href changed — which covers re-linking a
                    // selection that already contained one.
                    const priorHref = new Map<Element, string | null>();
                    editor.editorArea.querySelectorAll('a').forEach(a => priorHref.set(a, a.getAttribute('href')));

                    document.execCommand('createLink', false, url);

                    editor.editorArea.querySelectorAll('a').forEach(a => {
                        const had = priorHref.has(a);
                        if (had && priorHref.get(a) === a.getAttribute('href')) return;
                        applyLinkAttrs(a as HTMLAnchorElement, url, tokenOpen, tokenClose);
                    });
                    return;
                }

                const a = document.createElement('a');
                a.textContent = text;
                applyLinkAttrs(a, url, tokenOpen, tokenClose);

                const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range) {
                    range.deleteContents();
                    range.insertNode(a);
                    const after = document.createRange();
                    after.setStartAfter(a);
                    after.collapse(true);
                    sel?.removeAllRanges();
                    sel?.addRange(after);
                } else {
                    editor.editorArea.appendChild(a);
                }
            }

            // ── Hover bubble ─────────────────────────────────────────────

            function cancelHide() {
                if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                }
            }

            function hideBubble() {
                cancelHide();
                bubble?.remove();
                activeAnchor = null;
            }

            /** Small grace period so the pointer can travel from link to bubble. */
            function scheduleHide() {
                cancelHide();
                hideTimer = setTimeout(hideBubble, 250);
            }

            function ensureBubble(): HTMLDivElement {
                if (bubble) return bubble;

                bubble = document.createElement('div');
                bubble.className = 'play-editor-link-bubble';
                bubble.setAttribute('role', 'toolbar');
                bubble.setAttribute('aria-label', 'Link actions');

                urlLabel = document.createElement('span');
                urlLabel.className = 'play-editor-link-bubble-url';
                bubble.appendChild(urlLabel);

                const action = (icon: string, label: string, onClick: () => void) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'play-editor-link-bubble-btn';
                    b.title = label;
                    b.setAttribute('aria-label', label);
                    b.innerHTML = icon;
                    // mousedown would collapse the editor selection before the click lands
                    b.addEventListener('mousedown', e => e.preventDefault());
                    b.addEventListener('click', e => {
                        e.preventDefault();
                        onClick();
                    });
                    bubble!.appendChild(b);
                    return b;
                };

                action(icons.externalLink, 'Open link', () => {
                    const a = activeAnchor;
                    hideBubble();
                    // A variable has no address until something resolves it, so
                    // there is nothing to open. Opening the inert placeholder
                    // would just look broken.
                    if (!a || a.hasAttribute('data-href-token')) return;
                    const href = a.getAttribute('href');
                    if (href) window.open(href, '_blank', 'noopener,noreferrer');
                });
                action(icons.pencil, 'Edit link', () => {
                    const a = activeAnchor;
                    hideBubble();
                    if (a) openLinkModal(a, null);
                });
                action(icons.unlink, 'Remove link', () => {
                    const a = activeAnchor;
                    hideBubble();
                    if (!a) return;
                    unwrapAnchor(a);
                    editor.notifyContentChange();
                });

                bubble.addEventListener('mouseenter', cancelHide);
                bubble.addEventListener('mouseleave', scheduleHide);
                return bubble;
            }

            function showBubble(a: HTMLAnchorElement) {
                cancelHide();
                const el = ensureBubble();
                activeAnchor = a;

                const shown = displayUrl(a, tokenOpen, tokenClose);
                urlLabel!.textContent = shown;
                urlLabel!.title = shown;

                editor.container.style.position = 'relative';
                editor.container.appendChild(el);

                const linkRect = a.getBoundingClientRect();
                const containerRect = editor.container.getBoundingClientRect();
                let left = linkRect.left - containerRect.left;
                const width = el.offsetWidth || 260;
                if (left + width > containerRect.width) left = containerRect.width - width - 8;
                if (left < 0) left = 0;

                el.style.top = `${linkRect.bottom - containerRect.top + 6}px`;
                el.style.left = `${left}px`;
            }

            /**
             * Button blocks embed their own anchor and already open a richer editor
             * on click — two overlapping affordances on one element would just fight.
             */
            function editableAnchorAt(target: EventTarget | null): HTMLAnchorElement | null {
                const el = target as HTMLElement | null;
                if (!el || typeof el.closest !== 'function') return null;
                const a = el.closest('a') as HTMLAnchorElement | null;
                if (!a || !editor.editorArea.contains(a)) return null;
                if (a.closest('.play-editor-button-block')) return null;
                return a;
            }

            // ── Wiring ───────────────────────────────────────────────────

            const onMouseOver = (e: MouseEvent) => {
                const a = editableAnchorAt(e.target);
                if (a) showBubble(a);
                else if (activeAnchor) scheduleHide();
            };

            const onMouseLeave = () => {
                if (activeAnchor) scheduleHide();
            };

            const onDblClick = (e: MouseEvent) => {
                const a = editableAnchorAt(e.target);
                if (!a) return;
                e.preventDefault();
                hideBubble();
                openLinkModal(a, null);
            };

            // Any press outside the bubble (toolbar, source-mode toggle, the text
            // itself) means the bubble is stale — drop it rather than leave it
            // floating over unrelated content.
            const onDocMouseDown = (e: MouseEvent) => {
                if (bubble && bubble.contains(e.target as Node)) return;
                hideBubble();
            };

            const onScroll = () => hideBubble();

            editor.editorArea.addEventListener('mouseover', onMouseOver);
            editor.editorArea.addEventListener('mouseleave', onMouseLeave);
            editor.editorArea.addEventListener('dblclick', onDblClick);
            editor.editorArea.addEventListener('scroll', onScroll);
            document.addEventListener('mousedown', onDocMouseDown);
            window.addEventListener('scroll', onScroll, true);

            editor.addToolbarDivider();

            editor.addToolbarButton(icons.link, 'Insert Link', () => {
                const sel = window.getSelection();
                const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
                openLinkModal(null, savedRange);
            });

            editor.addToolbarButton(icons.unlink, 'Unlink', () => {
                hideBubble();
                editor.execCommand('unlink');
            });

            editor.onDestroy(() => {
                hideBubble();
                bubble = null;
                urlLabel = null;
                editor.editorArea.removeEventListener('mouseover', onMouseOver);
                editor.editorArea.removeEventListener('mouseleave', onMouseLeave);
                editor.editorArea.removeEventListener('dblclick', onDblClick);
                editor.editorArea.removeEventListener('scroll', onScroll);
                document.removeEventListener('mousedown', onDocMouseDown);
                window.removeEventListener('scroll', onScroll, true);
            });
        }
    };
}

/** Pre-configured links plugin with the default email token set */
export const LinksPlugin = createLinksPlugin();
