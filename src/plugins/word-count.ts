import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

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

        // Memoize the last counted values so selection-only changes don't re-scan text
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

        function getSelectedText(): string {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
            if (!editor.editorArea.contains(sel.anchorNode)) return '';
            return sel.toString();
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
            // Text unchanged — only re-render with current selection. No textContent scan.
            render();
        };

        // Use the editor's rAF-coalesced dispatchers (single selectionchange / input
        // across all plugins) instead of adding our own document-level listener.
        const unsubInput = editor.onInput(onInput);
        const unsubSel = editor.onSelectionChange(onSelectionChange);

        // Initial count
        refreshTextStats();
        render();

        editor.onDestroy(() => {
            unsubInput();
            unsubSel();
            statusBar.remove();
        });
    }
};
