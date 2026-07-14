import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { formatHtml } from './source-code-format';
import { highlightHtml } from './source-code-highlight';

const FOLD_MARKER_RE = / ⟨…\d+ lines…⟩$/;

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
        let textarea: HTMLTextAreaElement | null = null;

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
            gutterEl.scrollTop = textarea.scrollTop;
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
            syncScroll();
        }

        // Folding removes lines from the textarea's own value (not just visually
        // hides them) so the highlight overlay and gutter never drift out of sync
        // with what's actually there. That means folded text must always be
        // restored before it's read for real — on focus/click (so typing is safe)
        // and before exporting the final HTML on exit.
        function expandAllFolds() {
            if (!textarea || foldStore.size === 0) return;
            const lines = textarea.value.split('\n');
            const entries = Array.from(foldStore.entries()).sort((a, b) => b[0] - a[0]);
            entries.forEach(([lineIndex, stored]) => {
                lines[lineIndex] = lines[lineIndex].replace(FOLD_MARKER_RE, '');
                lines.splice(lineIndex + 1, 0, ...stored);
            });
            foldStore.clear();
            textarea.value = lines.join('\n');
            render();
        }

        function toggleFold(lineIndex: number) {
            if (!textarea) return;
            const lines = textarea.value.split('\n');

            if (foldStore.has(lineIndex)) {
                const stored = foldStore.get(lineIndex)!;
                foldStore.delete(lineIndex);
                lines[lineIndex] = lines[lineIndex].replace(FOLD_MARKER_RE, '');
                lines.splice(lineIndex + 1, 0, ...stored);
            } else {
                const closer = computeFoldRanges(lines).get(lineIndex);
                if (closer === undefined) return;
                const removed = lines.splice(lineIndex + 1, closer - lineIndex);
                foldStore.set(lineIndex, removed);
                lines[lineIndex] = `${lines[lineIndex]} ⟨…${removed.length} lines…⟩`;
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
            textarea.value = formatHtml(textarea.value);
            render();
            textarea.focus();
        }

        function buildSourceView(formatted: string): HTMLDivElement {
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

            textarea = document.createElement('textarea');
            textarea.className = 'play-editor-source-textarea';
            textarea.spellcheck = false;
            textarea.wrap = 'off';
            textarea.setAttribute('autocomplete', 'off');
            textarea.setAttribute('autocapitalize', 'off');
            textarea.setAttribute('aria-label', 'HTML source code');
            textarea.value = formatted;

            textarea.addEventListener('input', render);
            textarea.addEventListener('scroll', syncScroll);
            textarea.addEventListener('mousedown', expandAllFolds);
            textarea.addEventListener('focus', expandAllFolds);
            textarea.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                e.preventDefault();
                const t = textarea!;
                const start = t.selectionStart;
                const end = t.selectionEnd;
                t.value = `${t.value.slice(0, start)}  ${t.value.slice(end)}`;
                t.selectionStart = t.selectionEnd = start + 2;
                render();
            });

            gutterEl.addEventListener('click', (e) => {
                const toggle = (e.target as HTMLElement).closest<HTMLButtonElement>('.play-editor-fold-toggle');
                if (!toggle) return;
                const lineIndex = Number(toggle.dataset.line);
                if (!Number.isNaN(lineIndex)) toggleFold(lineIndex);
            });

            codearea.appendChild(highlightEl);
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

            const formatted = formatHtml(editor.editorArea.innerHTML);

            editor.editorArea.style.display = 'none';
            editor.container.appendChild(buildSourceView(formatted));
            btn.classList.add('play-editor-btn-active');

            const controls = getOtherToolbarControls();
            controls.forEach(el => {
                el.setAttribute('data-pe-was-disabled', el.disabled ? 'true' : 'false');
                el.disabled = true;
            });

            textarea?.focus();
        }

        function exitSourceMode() {
            isSourceMode = false;
            expandAllFolds();

            editor.setContent(textarea?.value ?? '');

            wrapper?.remove();
            wrapper = null;
            gutterEl = null;
            highlightEl = null;
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
