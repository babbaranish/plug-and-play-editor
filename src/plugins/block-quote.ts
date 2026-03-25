import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const BlockQuotePlugin: Plugin = {
    name: 'block-quote',
    init(editor: Editor) {
        const btn = editor.addToolbarButton(icons.quote, 'Block Quote', () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;

            // Check if already in blockquote
            let node: Node | null = sel.anchorNode;
            let inBlockquote = false;
            while (node && node !== editor.editorArea) {
                if (node instanceof HTMLElement && node.tagName === 'BLOCKQUOTE') {
                    inBlockquote = true;
                    break;
                }
                node = node.parentNode;
            }

            if (inBlockquote) {
                editor.exec('formatBlock', '<p>');
            } else {
                editor.exec('formatBlock', '<blockquote>');
            }
        });

        // Track active state via selectionchange
        const updateActive = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || !editor.editorArea.contains(sel.anchorNode)) {
                btn.classList.remove('play-editor-btn-active');
                return;
            }
            let node: Node | null = sel.anchorNode;
            let inBlockquote = false;
            while (node && node !== editor.editorArea) {
                if (node instanceof HTMLElement && node.tagName === 'BLOCKQUOTE') {
                    inBlockquote = true;
                    break;
                }
                node = node.parentNode;
            }
            btn.classList.toggle('play-editor-btn-active', inBlockquote);
        };

        document.addEventListener('selectionchange', updateActive);
        editor.onDestroy(() => document.removeEventListener('selectionchange', updateActive));
    }
};
