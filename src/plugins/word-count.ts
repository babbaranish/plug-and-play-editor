import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { comparePoints } from '../core/selection';

export const WordCountPlugin: Plugin = {
    name: 'word-count',
    init(editor: Editor) {
        const statusBar = document.createElement('div');
        statusBar.className = 'play-editor-status-bar';
        statusBar.setAttribute('aria-live', 'polite');
        statusBar.setAttribute('aria-label', 'Editor statistics');

        statusBar.style.padding = '6px 16px';
        statusBar.style.borderTop = '1px solid var(--pe-border)';
        statusBar.style.background = 'var(--pe-toolbar-bg)';
        statusBar.style.fontSize = '12px';
        statusBar.style.color = 'var(--pe-text-muted)';
        statusBar.style.fontFamily = 'inherit';
        statusBar.style.display = 'flex';
        statusBar.style.justifyContent = 'flex-end';
        statusBar.style.alignItems = 'center';
        statusBar.style.userSelect = 'none';

        editor.container.appendChild(statusBar);

        let cachedText = '';
        let cachedWords = 0;
        let cachedChars = 0;

        function countWords(text: string): number {
            const trimmed = text.trim();
            if (!trimmed) return 0;
            return trimmed.split(/\s+/).length;
        }

        function refreshTextStats() {
            const text = editor.editorArea.textContent || '';
            if (text === cachedText) return;
            cachedText = text;
            cachedChars = text.length;
            cachedWords = countWords(text);
        }

        /**
         * Selection text length derived from the structured selection. The
         * browser's `Selection.toString()` has inconsistent newline handling
         * across browsers; we still need it for the actual text *value* (for
         * word counting), but the *character* count can be derived from a
         * simpler source — the textContent slice between the anchor and focus
         * Points.
         */
        function getSelectedText(): string {
            const sel = editor.getSelection();
            if (sel.kind !== 'range') return '';
            if (comparePoints(sel.anchor, sel.focus) === 0) return '';
            const live = window.getSelection();
            if (!live) return '';
            return live.toString();
        }

        function render() {
            const selectedText = getSelectedText();
            if (selectedText) {
                const selWords = countWords(selectedText);
                const selChars = selectedText.length;
                statusBar.textContent = `${selWords} of ${cachedWords} words selected | ${selChars} of ${cachedChars} characters selected`;
            } else {
                statusBar.textContent = `${cachedWords} words | ${cachedChars} characters`;
            }
        }

        const onInput = () => {
            refreshTextStats();
            render();
        };

        const onSelectionChange = () => {
            render();
        };

        const unsubInput = editor.onInput(onInput);
        const unsubSel = editor.onSelectionChange(onSelectionChange);

        refreshTextStats();
        render();

        editor.onDestroy(() => {
            unsubInput();
            unsubSel();
            statusBar.remove();
        });
    }
};
