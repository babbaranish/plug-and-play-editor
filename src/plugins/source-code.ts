import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { formatHtml } from './source-code-format';
import { highlightHtml, escapeHtml } from './source-code-highlight';
import { findMatchingTag } from './source-code-match';
import type { TagMatch } from './source-code-match';

const FOLD_MARKER_RE = / ⟨…\d+ lines…⟩$/;

/** Renders the source with the two tags of a match wrapped in `<mark>`. */
function renderMatchLayer(text: string, match: TagMatch): string {
    const mark = (from: number, to: number) =>
        `<mark class="pe-tag-match">${escapeHtml(text.slice(from, to))}</mark>`;
    const [openStart, openEnd] = match.open;
    const [closeStart, closeEnd] = match.close;
    return escapeHtml(text.slice(0, openStart))
        + mark(openStart, openEnd)
        + escapeHtml(text.slice(openEnd, closeStart))
        + mark(closeStart, closeEnd)
        + escapeHtml(text.slice(closeEnd));
}

function getLineDepth(line: string): number {
    const match = line.match(/^ */);
    return match ? Math.floor(match[0].length / 2) : 0;
}

/** Maps each foldable opener line index to its matching closer line index (inclusive). */
function computeFoldRanges(lines: string[]): Map<number, number> {
    const ranges = new Map<number, number>();
    for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i].trim()) continue;
        const depth = getLineDepth(lines[i]);
        if (getLineDepth(lines[i + 1]) <= depth) continue;

        let j = i + 1;
        while (j < lines.length && getLineDepth(lines[j]) > depth) j++;
        if (j < lines.length) ranges.set(i, j);
    }
    return ranges;
}

/** Copy of `lines` with the entry at `index` replaced by `replacement`. */
function replaceAt(lines: string[], index: number, replacement: string[]): string[] {
    return lines.slice(0, index).concat(replacement, lines.slice(index + 1));
}

/**
 * Copy of `lines` with every fold in `store` expanded back to its hidden lines.
 * Keys are opener indexes into `lines`. Nothing is mutated, so the textarea can
 * keep its folds while the full source is read.
 */
function expandFolds(lines: string[], store: Map<number, string[]>): string[] {
    let out = lines;
    // Bottom-up, so an earlier opener's index is not shifted by a later insert.
    Array.from(store.keys()).sort((a, b) => b - a).forEach((key) => {
        const opener = out[key].replace(FOLD_MARKER_RE, '');
        out = replaceAt(out, key, [opener].concat(store.get(key)!));
    });
    return out;
}

export const SourceCodePlugin: Plugin = {
    name: 'source-code',
    init(editor: Editor) {
        let isSourceMode = false;
        // Lines removed by a fold, keyed by the opener line's index in the
        // *currently collapsed* textarea value. Only ever populated while the
        // textarea is unfocused — see expandAllFolds().
        let foldStore = new Map<number, string[]>();

        let wrapper: HTMLDivElement | null = null;
        let gutterEl: HTMLDivElement | null = null;
        let highlightEl: HTMLElement | null = null;
        let matchEl: HTMLElement | null = null;
        let textarea: HTMLTextAreaElement | null = null;
        let unregisterContentSource: (() => void) | null = null;
        // The source as it was set when the view opened (formatted). Compared on
        // exit so a view that was never edited doesn't rewrite the editor.
        let openedSource: string | null = null;
        // Last paint of the match layer, keyed by source and matched pair, so
        // caret moves within the same tag skip the rebuild.
        let matchSeen: { value: string; key: string } | null = null;
        // Set by any edit in this session. Exit uses it to tell the host about
        // edits that were undone, since the host last saw the edited text.
        let hadInput = false;

        function getOtherToolbarControls(): (HTMLButtonElement | HTMLSelectElement | HTMLInputElement)[] {
            const all = editor.toolbar.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
                'button, select, input'
            );
            return Array.from(all).filter(el => el !== btn);
        }

        function syncScroll() {
            if (!textarea || !highlightEl || !gutterEl) return;
            highlightEl.scrollTop = textarea.scrollTop;
            highlightEl.scrollLeft = textarea.scrollLeft;
            if (matchEl) {
                matchEl.scrollTop = textarea.scrollTop;
                matchEl.scrollLeft = textarea.scrollLeft;
            }
            gutterEl.scrollTop = textarea.scrollTop;
        }

        // Paints the pair of tags for the caret's tag. Only active while the
        // textarea has focus and the selection is a caret. The cache skips the
        // scan when neither the text nor the caret moved.
        function updateMatch() {
            if (!textarea || !matchEl) return;
            const t = textarea;
            const active = document.activeElement === t && t.selectionStart === t.selectionEnd;
            const pair = active ? findMatchingTag(t.value, t.selectionStart) : null;
            const key = pair ? `${pair.open}|${pair.close}` : '';
            if (matchSeen && matchSeen.value === t.value && matchSeen.key === key) return;
            matchSeen = { value: t.value, key };

            matchEl.innerHTML = pair ? renderMatchLayer(t.value, pair) : '';
            syncScroll();
        }

        function clearMatch() {
            matchSeen = null;
            if (matchEl) matchEl.innerHTML = '';
            syncScroll();
        }

        /**
         * The full source with every fold restored. Reads the textarea without
         * touching it, so a folded view can still be saved or compared.
         */
        function fullSource(): string {
            if (!textarea) return '';
            return expandFolds(textarea.value.split('\n'), foldStore).join('\n');
        }

        function render() {
            if (!textarea || !highlightEl || !gutterEl) return;
            const text = textarea.value;
            highlightEl.innerHTML = highlightHtml(text);

            const lines = text.split('\n');
            const foldRanges = computeFoldRanges(lines);

            const frag = document.createDocumentFragment();
            lines.forEach((_, i) => {
                const row = document.createElement('div');
                row.className = 'play-editor-source-gutter-row';

                if (foldStore.has(i) || foldRanges.has(i)) {
                    const toggle = document.createElement('button');
                    toggle.type = 'button';
                    toggle.className = 'play-editor-fold-toggle';
                    if (foldStore.has(i)) toggle.classList.add('play-editor-fold-collapsed');
                    toggle.setAttribute('aria-label', foldStore.has(i) ? 'Expand block' : 'Collapse block');
                    toggle.dataset.line = String(i);
                    row.appendChild(toggle);
                } else {
                    const spacer = document.createElement('span');
                    spacer.className = 'play-editor-fold-spacer';
                    row.appendChild(spacer);
                }

                const num = document.createElement('span');
                num.className = 'play-editor-line-num';
                num.textContent = String(i + 1);
                row.appendChild(num);

                frag.appendChild(row);
            });

            gutterEl.innerHTML = '';
            gutterEl.appendChild(frag);
            updateMatch();
            syncScroll();
        }

        // Folding removes lines from the textarea's own value (not just visually
        // hides them) so the highlight overlay and gutter never drift out of sync
        // with what's actually there. That means folded text must always be
        // restored before it's read for real — on focus/click (so typing is safe)
        // and before exporting the final HTML on exit.
        function expandAllFolds() {
            if (!textarea || foldStore.size === 0) return;
            textarea.value = fullSource();
            foldStore.clear();
            render();
        }

        function toggleFold(lineIndex: number) {
            if (!textarea) return;
            let lines = textarea.value.split('\n');

            if (foldStore.has(lineIndex)) {
                // Lines after the opener move down by the restored count.
                const stored = foldStore.get(lineIndex)!;
                const next = new Map<number, string[]>();
                foldStore.forEach((hidden, key) => {
                    if (key !== lineIndex) next.set(key > lineIndex ? key + stored.length : key, hidden);
                });
                foldStore = next;
                const opener = lines[lineIndex].replace(FOLD_MARKER_RE, '');
                lines = replaceAt(lines, lineIndex, [opener].concat(stored));
            } else {
                const closer = computeFoldRanges(lines).get(lineIndex);
                if (closer === undefined) return;

                // A fold already inside this range is expanded into the lines kept
                // here, so the store never nests and every key stays a real line.
                let removed = lines.slice(lineIndex + 1, closer + 1);
                Array.from(foldStore.keys())
                    .filter((key) => key > lineIndex && key <= closer)
                    .sort((a, b) => b - a)
                    .forEach((key) => {
                        const pos = key - lineIndex - 1;
                        const opener = removed[pos].replace(FOLD_MARKER_RE, '');
                        removed = replaceAt(removed, pos, [opener].concat(foldStore.get(key)!));
                        foldStore.delete(key);
                    });

                const next = new Map<number, string[]>();
                foldStore.forEach((hidden, key) => {
                    next.set(key > closer ? key - (closer - lineIndex) : key, hidden);
                });
                next.set(lineIndex, removed);
                foldStore = next;

                const marked = `${lines[lineIndex]} ⟨…${removed.length} lines…⟩`;
                lines = lines.slice(0, lineIndex).concat([marked], lines.slice(closer + 1));
            }

            textarea.value = lines.join('\n');
            render();
        }

        // Re-indents the current source on demand. Reformatting re-derives the
        // whole string from a parsed DOM, so there's no meaningful old-offset to
        // new-offset mapping for the caret — it's left wherever the browser puts
        // it after the value swap rather than faking precision we don't have.
        function formatCurrentSource() {
            if (!textarea) return;
            expandAllFolds();
            const formatted = formatHtml(textarea.value);
            if (formatted !== textarea.value) hadInput = true;
            textarea.value = formatted;
            render();
            textarea.focus();
        }

        function buildSourceView(initialSource: string): HTMLDivElement {
            wrapper = document.createElement('div');
            wrapper.className = 'play-editor-source-root';

            const header = document.createElement('div');
            header.className = 'play-editor-source-header';

            const formatBtn = document.createElement('button');
            formatBtn.type = 'button';
            formatBtn.className = 'play-editor-source-format-btn';
            formatBtn.title = 'Format code';
            formatBtn.setAttribute('aria-label', 'Format code');
            formatBtn.innerHTML = icons.indent;
            formatBtn.addEventListener('click', formatCurrentSource);
            header.appendChild(formatBtn);

            const body = document.createElement('div');
            body.className = 'play-editor-source-wrapper';

            gutterEl = document.createElement('div');
            gutterEl.className = 'play-editor-source-gutter';
            gutterEl.setAttribute('aria-hidden', 'true');

            const codearea = document.createElement('div');
            codearea.className = 'play-editor-source-codearea';

            highlightEl = document.createElement('pre');
            highlightEl.className = 'play-editor-source-highlight';
            highlightEl.setAttribute('aria-hidden', 'true');

            // Sits between the highlight and the textarea. It is transparent except
            // for the matched tag pair, which is marked.
            matchEl = document.createElement('pre');
            matchEl.className = 'play-editor-source-match';
            matchEl.setAttribute('aria-hidden', 'true');
            matchSeen = null;

            textarea = document.createElement('textarea');
            textarea.className = 'play-editor-source-textarea';
            textarea.spellcheck = false;
            textarea.wrap = 'off';
            textarea.setAttribute('autocomplete', 'off');
            textarea.setAttribute('autocapitalize', 'off');
            textarea.setAttribute('aria-label', 'HTML source code');
            textarea.value = initialSource;

            textarea.addEventListener('input', () => {
                hadInput = true;
                render();
                editor.notifyContentChange();
            });
            textarea.addEventListener('scroll', syncScroll);
            textarea.addEventListener('mousedown', expandAllFolds);
            textarea.addEventListener('focus', expandAllFolds);
            textarea.addEventListener('focus', updateMatch);
            textarea.addEventListener('click', updateMatch);
            textarea.addEventListener('keyup', updateMatch);
            textarea.addEventListener('blur', clearMatch);
            textarea.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                e.preventDefault();
                const t = textarea!;
                const start = t.selectionStart;
                const end = t.selectionEnd;
                t.value = `${t.value.slice(0, start)}  ${t.value.slice(end)}`;
                t.selectionStart = t.selectionEnd = start + 2;
                hadInput = true;
                render();
            });

            gutterEl.addEventListener('click', (e) => {
                const toggle = (e.target as HTMLElement).closest<HTMLButtonElement>('.play-editor-fold-toggle');
                if (!toggle) return;
                const lineIndex = Number(toggle.dataset.line);
                if (!Number.isNaN(lineIndex)) toggleFold(lineIndex);
            });

            codearea.appendChild(highlightEl);
            codearea.appendChild(matchEl);
            codearea.appendChild(textarea);
            body.appendChild(gutterEl);
            body.appendChild(codearea);
            wrapper.appendChild(header);
            wrapper.appendChild(body);

            render();
            return wrapper;
        }

        function enterSourceMode() {
            isSourceMode = true;
            foldStore = new Map();
            hadInput = false;

            // The source opens pretty-printed. Leaving without editing keeps the
            // editor's original HTML (see exitSourceMode), so opening the view alone
            // never rewrites the markup.
            const source = formatHtml(editor.editorArea.innerHTML);
            openedSource = source;

            editor.editorArea.style.display = 'none';
            editor.container.appendChild(buildSourceView(source));
            btn.classList.add('play-editor-btn-active');

            // getContent()/onChange/onInput must reflect the textarea while it's
            // the real source of truth, not the (now hidden, stale) editorArea.
            unregisterContentSource = editor.registerContentSource(fullSource);
            document.addEventListener('selectionchange', updateMatch);

            const controls = getOtherToolbarControls();
            controls.forEach(el => {
                el.setAttribute('data-pe-was-disabled', el.disabled ? 'true' : 'false');
                el.disabled = true;
            });

            textarea?.focus();
        }

        function exitSourceMode() {
            isSourceMode = false;

            // Folded lines are part of the source, so the full text is what gets saved.
            const current = fullSource();
            if (current !== openedSource) {
                editor.setContent(current);
            } else {
                // Untouched: the editor keeps its original HTML. A keystroke earlier
                // in this session may have overwritten the hidden field, so re-sync it.
                editor.textArea.value = editor.editorArea.innerHTML;
            }
            openedSource = null;
            unregisterContentSource?.();
            unregisterContentSource = null;
            // The host's last onChange may have seen edited text that was undone
            // since. Tell it the editor's current content.
            if (hadInput) editor.notifyContentChange();
            hadInput = false;
            document.removeEventListener('selectionchange', updateMatch);
            clearMatch();

            wrapper?.remove();
            wrapper = null;
            gutterEl = null;
            highlightEl = null;
            matchEl = null;
            textarea = null;
            foldStore = new Map();

            editor.editorArea.style.display = '';
            btn.classList.remove('play-editor-btn-active');

            const controls = getOtherToolbarControls();
            controls.forEach(el => {
                const wasDisabled = el.getAttribute('data-pe-was-disabled') === 'true';
                el.disabled = wasDisabled;
                el.removeAttribute('data-pe-was-disabled');
            });
        }

        const btn = editor.addToolbarButton(icons.code, 'Source Code', () => {
            if (isSourceMode) {
                exitSourceMode();
            } else {
                enterSourceMode();
            }
        });

        editor.onDestroy(() => {
            if (isSourceMode) exitSourceMode();
        });
    }
};
