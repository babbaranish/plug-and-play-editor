import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

export const WordCountPlugin: Plugin = {
    name: 'word-count',
    init(editor: Editor) {
        const statusBar = document.createElement('div');
        statusBar.className = 'play-editor-status-bar';
        statusBar.setAttribute('aria-live', 'polite');
        statusBar.setAttribute('aria-label', 'Editor statistics');

        // Inline styles
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

        function getTextContent(): string {
            return editor.editorArea.textContent || editor.editorArea.innerText || '';
        }

        function countWords(text: string): number {
            const trimmed = text.trim();
            if (!trimmed) return 0;
            return trimmed.split(/\s+/).length;
        }

        function countChars(text: string): number {
            return text.length;
        }

        function getSelectedText(): string {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
            if (!editor.editorArea.contains(sel.anchorNode)) return '';
            return sel.toString();
        }

        function update() {
            const text = getTextContent();
            const words = countWords(text);
            const chars = countChars(text);

            const selectedText = getSelectedText();

            if (selectedText && selectedText.length > 0) {
                const selWords = countWords(selectedText);
                const selChars = countChars(selectedText);
                statusBar.textContent = `${selWords} of ${words} words selected | ${selChars} of ${chars} characters selected`;
            } else {
                statusBar.textContent = `${words} words | ${chars} characters`;
            }
        }

        const onInput = () => update();
        editor.editorArea.addEventListener('input', onInput);

        const onSelectionChange = () => {
            if (!editor.editorArea.contains(document.activeElement)) return;
            update();
        };
        document.addEventListener('selectionchange', onSelectionChange);

        // Initial count
        update();

        // Cleanup
        editor.onDestroy(() => {
            editor.editorArea.removeEventListener('input', onInput);
            document.removeEventListener('selectionchange', onSelectionChange);
            statusBar.remove();
        });
    }
};
