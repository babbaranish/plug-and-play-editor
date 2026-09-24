import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const searchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

const STYLE_ID = 'play-editor-find-replace-styles';

function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .play-editor-find-panel {
            position: relative;
            z-index: 100;
            background: #f9fafb;
            border-bottom: 1px solid #d1d5db;
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .play-editor-find-panel .find-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .play-editor-find-panel input {
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
            outline: none;
            font-family: inherit;
        }
        .play-editor-find-panel input:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .play-editor-find-panel .find-count {
            font-size: 12px;
            color: #6b7280;
            white-space: nowrap;
            min-width: 70px;
            text-align: right;
        }
        .play-editor-find-panel button {
            padding: 4px 10px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            background: #fff;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            font-family: inherit;
        }
        .play-editor-find-panel button:hover {
            background: #f3f4f6;
        }
        .play-editor-find-panel button.find-primary {
            background: #3b82f6;
            color: #fff;
            border-color: #3b82f6;
        }
        .play-editor-find-panel button.find-primary:hover {
            background: #2563eb;
        }
        .play-editor-find-panel .find-btn-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .play-editor-find-panel .find-spacer {
            flex: 1;
        }
        ::highlight(pe-find) {
            background-color: #fef08a;
        }
        /* The code view's text is near-white; on yellow it needs to be dark. */
        .play-editor-source-highlight span::highlight(pe-find) {
            color: #1e293b;
        }
        ::highlight(pe-find-current) {
            background-color: #fb923c;
            color: white;
        }
    `;
    document.head.appendChild(style);
}

/** Case-insensitive start offsets of every occurrence of `query` in `text`. */
export function findOffsets(text: string, query: string): number[] {
    if (!query) return [];
    const hay = text.toLowerCase();
    const needle = query.toLowerCase();
    const out: number[] = [];
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) out.push(i);
    return out;
}

/** Replaces every case-insensitive occurrence, literally — `$&` in the replacement is text, not a pattern. */
export function replaceAllLiteral(text: string, query: string, replacement: string): string {
    const offsets = findOffsets(text, query);
    let out = '';
    let last = 0;
    for (const o of offsets) {
        out += text.slice(last, o) + replacement;
        last = o + query.length;
    }
    return out + text.slice(last);
}

interface Match {
    /** Live range over the visible text, used for painting and replacing. */
    range: Range;
    /** Offsets into the source textarea's value (code view only). */
    start: number;
    end: number;
}

/**
 * Matches are painted with the CSS Custom Highlight API instead of being wrapped
 * in `<mark>` elements. Wrapping mutated the document itself: open Find, switch
 * to the code view, and the marks were in the source — and from there in the
 * saved HTML, as yellow highlights in the sent email. A highlight is paint only;
 * nothing a reader of the document can see.
 *
 * The registry is global and keyed by name, so every editor on the page shares
 * the two names below; each instance contributes its ranges here.
 */
const painted = new Map<object, { all: Range[]; current: Range | null }>();

function repaint(): void {
    if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return;
    const all = new Highlight();
    const current = new Highlight();
    current.priority = 1;
    painted.forEach(p => {
        p.all.forEach(r => all.add(r));
        if (p.current) current.add(p.current);
    });
    if (all.size) CSS.highlights.set('pe-find', all); else CSS.highlights.delete('pe-find');
    if (current.size) CSS.highlights.set('pe-find-current', current); else CSS.highlights.delete('pe-find-current');
}

export const FindReplacePlugin: Plugin = {
    name: 'find-replace',
    init(editor: Editor) {
        injectStyles();

        const self = {};
        let panel: HTMLDivElement | null = null;
        let currentIndex = -1;
        let matches: Match[] = [];
        let mode: 'rich' | 'code' = 'rich';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let countEl: HTMLSpanElement;
        let searchInput: HTMLInputElement;
        let replaceInput: HTMLInputElement;

        /**
         * The code view, when it is open. Its textarea holds the real source and
         * its highlight overlay renders that source character for character, so
         * matches are found in the textarea's value and painted on the overlay.
         */
        function sourceView(): { ta: HTMLTextAreaElement; overlay: HTMLElement } | null {
            if (editor.editorArea.style.display !== 'none') return null;
            const ta = editor.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea');
            const overlay = editor.container.querySelector<HTMLElement>('.play-editor-source-highlight');
            return ta && overlay ? { ta, overlay } : null;
        }

        /** Builds ranges over the overlay's text nodes for [start, end) offsets of its text. */
        function overlayRanges(overlay: HTMLElement, spans: [number, number][]): Range[] {
            const nodes: { node: Text; start: number }[] = [];
            let pos = 0;
            const walker = document.createTreeWalker(overlay, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
                nodes.push({ node: n, start: pos });
                pos += n.data.length;
            }
            const locate = (off: number): [Text, number] | null => {
                let lo = 0;
                let hi = nodes.length - 1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    const { node, start } = nodes[mid];
                    if (off < start) hi = mid - 1;
                    else if (off > start + node.data.length) lo = mid + 1;
                    else return [node, off - start];
                }
                return null;
            };
            return spans.map(([a, b]) => {
                const r = document.createRange();
                const s = locate(a);
                const e = locate(b);
                if (s && e) {
                    r.setStart(s[0], s[1]);
                    r.setEnd(e[0], e[1]);
                }
                return r;
            });
        }

        function paint(): void {
            painted.set(self, {
                all: matches.map(m => m.range),
                current: currentIndex >= 0 && matches[currentIndex] ? matches[currentIndex].range : null
            });
            repaint();
        }

        function clearHighlights(): void {
            matches = [];
            currentIndex = -1;
            painted.delete(self);
            repaint();
        }

        function updateCount(): void {
            if (!countEl) return;
            if (matches.length === 0) {
                const query = searchInput?.value || '';
                countEl.textContent = query ? 'No matches' : '';
            } else {
                const display = currentIndex >= 0 ? `${currentIndex + 1} of ${matches.length}` : `${matches.length} matches`;
                countEl.textContent = display;
            }
        }

        function search(query: string, keepIndex = false): void {
            const prev = currentIndex;
            const src = sourceView();
            mode = src ? 'code' : 'rich';
            matches = [];

            if (query && src) {
                const offsets = findOffsets(src.ta.value, query);
                const ranges = overlayRanges(src.overlay, offsets.map(o => [o, o + query.length] as [number, number]));
                matches = offsets.map((o, i) => ({ range: ranges[i], start: o, end: o + query.length }));
            } else if (query) {
                const walker = document.createTreeWalker(editor.editorArea, NodeFilter.SHOW_TEXT);
                for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
                    for (const o of findOffsets(n.data, query)) {
                        const r = document.createRange();
                        r.setStart(n, o);
                        r.setEnd(n, o + query.length);
                        matches.push({ range: r, start: o, end: o + query.length });
                    }
                }
            }

            currentIndex = keepIndex && prev >= 0 && matches.length ? Math.min(prev, matches.length - 1) : -1;
            paint();
            updateCount();
        }

        /**
         * Bring matches up to date before acting on them: run a search still
         * waiting on the typing debounce (type then Enter within 200ms found
         * nothing), or re-search if the view switched (rich <-> code).
         */
        function ensureFresh(): void {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
                search(searchInput?.value || '');
            } else if ((sourceView() ? 'code' : 'rich') !== mode) {
                search(searchInput?.value || '');
            }
        }

        function reveal(m: Match): void {
            const src = mode === 'code' ? sourceView() : null;
            if (src) {
                // Selecting it means Escape → click into the code lands on the match.
                src.ta.setSelectionRange(m.start, m.end);
                const r = m.range.getBoundingClientRect();
                const box = src.ta.getBoundingClientRect();
                if (r.top < box.top || r.bottom > box.bottom) src.ta.scrollTop += r.top - box.top - box.height / 2;
                if (r.left < box.left || r.right > box.right) src.ta.scrollLeft += r.left - box.left - box.width / 2;
                return;
            }
            const el = m.range.startContainer.parentElement;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function goToMatch(index: number): void {
            ensureFresh();
            if (matches.length === 0) return;
            currentIndex = ((index % matches.length) + matches.length) % matches.length;
            paint();
            reveal(matches[currentIndex]);
            updateCount();
        }

        function replaceCurrentMatch(replacement: string): void {
            ensureFresh();
            if (matches.length === 0) return;
            if (currentIndex < 0) currentIndex = 0;
            const m = matches[currentIndex];
            const query = searchInput.value;

            if (mode === 'code') {
                const src = sourceView();
                if (!src) return;
                src.ta.value = src.ta.value.slice(0, m.start) + replacement + src.ta.value.slice(m.end);
                // The code view re-renders its overlay and reports the change on input.
                src.ta.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                const r = m.range;
                // Ranges are live; if an edit since the search changed this match, re-search instead.
                if (r.startContainer !== r.endContainer || r.toString().toLowerCase() !== query.toLowerCase()) {
                    search(query, true);
                    return;
                }
                (r.startContainer as Text).replaceData(r.startOffset, r.endOffset - r.startOffset, replacement);
                editor.notifyContentChange();
            }

            search(query, true);
            if (matches.length > 0) goToMatch(currentIndex);
        }

        function replaceAll(query: string, replacement: string): void {
            ensureFresh();
            if (!query) return;

            if (mode === 'code') {
                const src = sourceView();
                if (!src) return;
                src.ta.value = replaceAllLiteral(src.ta.value, query, replacement);
                src.ta.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                search(query);
                // Back to front, so replacing one match never shifts another's offsets.
                for (let i = matches.length - 1; i >= 0; i--) {
                    const r = matches[i].range;
                    if (r.startContainer !== r.endContainer) continue;
                    (r.startContainer as Text).replaceData(r.startOffset, r.endOffset - r.startOffset, replacement);
                }
                editor.notifyContentChange();
            }

            search(query);
        }

        function debouncedSearch(): void {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                search(searchInput.value);
            }, 200);
        }

        function buildPanel(): HTMLDivElement {
            const div = document.createElement('div');
            div.className = 'play-editor-find-panel';

            // Row 1: Search input + count
            const searchRow = document.createElement('div');
            searchRow.className = 'find-row';

            searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Find...';
            searchInput.setAttribute('aria-label', 'Search text');
            searchInput.addEventListener('input', debouncedSearch);
            searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    goToMatch(currentIndex + 1);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closePanel();
                }
            });

            countEl = document.createElement('span');
            countEl.className = 'find-count';

            searchRow.appendChild(searchInput);
            searchRow.appendChild(countEl);
            div.appendChild(searchRow);

            // Row 2: Replace input
            const replaceRow = document.createElement('div');
            replaceRow.className = 'find-row';

            replaceInput = document.createElement('input');
            replaceInput.type = 'text';
            replaceInput.placeholder = 'Replace...';
            replaceInput.setAttribute('aria-label', 'Replace text');
            replaceInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closePanel();
                }
            });

            replaceRow.appendChild(replaceInput);
            div.appendChild(replaceRow);

            // Row 3: Buttons
            const btnRow = document.createElement('div');
            btnRow.className = 'find-btn-row';

            const findNextBtn = document.createElement('button');
            findNextBtn.textContent = 'Find Next';
            findNextBtn.className = 'find-primary';
            findNextBtn.addEventListener('click', () => goToMatch(currentIndex + 1));

            const replaceBtn = document.createElement('button');
            replaceBtn.textContent = 'Replace';
            replaceBtn.addEventListener('click', () => {
                if (currentIndex < 0 && matches.length > 0) {
                    goToMatch(0);
                }
                replaceCurrentMatch(replaceInput.value);
            });

            const replaceAllBtn = document.createElement('button');
            replaceAllBtn.textContent = 'Replace All';
            replaceAllBtn.addEventListener('click', () => {
                replaceAll(searchInput.value, replaceInput.value);
            });

            const spacer = document.createElement('span');
            spacer.className = 'find-spacer';

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.addEventListener('click', () => closePanel());

            btnRow.appendChild(findNextBtn);
            btnRow.appendChild(replaceBtn);
            btnRow.appendChild(replaceAllBtn);
            btnRow.appendChild(spacer);
            btnRow.appendChild(closeBtn);
            div.appendChild(btnRow);

            return div;
        }

        function openPanel(): void {
            if (panel) {
                searchInput.focus();
                searchInput.select();
                if (searchInput.value) search(searchInput.value, true);
                return;
            }

            panel = buildPanel();

            // In the layout, directly under the toolbar — not floating over the
            // content, where it covered the first lines and hid any match on them.
            editor.toolbar.after(panel);
            searchInput.focus();
        }

        function closePanel(): void {
            clearHighlights();
            if (panel) {
                panel.remove();
                panel = null;
            }
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        }

        // Toolbar button
        editor.addToolbarButton(searchIcon, 'Find & Replace', () => {
            if (panel) {
                closePanel();
            } else {
                openPanel();
            }
        });

        // Keep counts and highlights current while the author edits, in either view.
        const unsubInput = editor.onInput(() => {
            if (panel && searchInput.value) search(searchInput.value, true);
        });

        // Ctrl/Cmd+F anywhere in the editor — the rich text, the code view's
        // textarea, or the panel itself. One listener on the container: the old
        // second listener on editorArea made every press open the panel twice.
        const handleKeydown = (e: KeyboardEvent): void => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                openPanel();
            }
        };

        editor.container.addEventListener('keydown', handleKeydown);

        editor.onDestroy(() => {
            clearHighlights();
            unsubInput();
            if (panel) panel.remove();
            if (debounceTimer) clearTimeout(debounceTimer);
            editor.container.removeEventListener('keydown', handleKeydown);
        });
    }
};
