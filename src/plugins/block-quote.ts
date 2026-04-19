import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

function isInsideBlockquote(node: Node | null, stopAt: Node): boolean {
    while (node && node !== stopAt) {
        if ((node as HTMLElement).tagName === 'BLOCKQUOTE') return true;
        node = node.parentNode;
    }
    return false;
}

export const BlockQuotePlugin: Plugin = {
    name: 'block-quote',
    init(editor: Editor) {
        const btn = editor.addToolbarButton(icons.quote, 'Block Quote', () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;

            if (isInsideBlockquote(sel.anchorNode, editor.editorArea)) {
                editor.execCommand('formatBlock', '<p>');
            } else {
                editor.execCommand('formatBlock', '<blockquote>');
            }
        });

        // Cache anchor + active state so unmoved selections skip the DOM walk
        let lastAnchor: Node | null = null;
        let lastActive = false;

        const updateActive = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const anchor = sel.anchorNode;
            if (anchor === lastAnchor) return;
            lastAnchor = anchor;

            const inBlockquote = isInsideBlockquote(anchor, editor.editorArea);
            if (inBlockquote === lastActive) return;
            lastActive = inBlockquote;
            btn.classList.toggle('play-editor-btn-active', inBlockquote);
        };

        const unsub = editor.onSelectionChange(updateActive);
        editor.onDestroy(unsub);
    }
};
