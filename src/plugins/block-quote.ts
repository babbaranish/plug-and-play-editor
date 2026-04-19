import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import type { Point } from '../core/selection';

/**
 * Walk the DOM from the leaf named by `point` up to `editorArea`, looking
 * for a BLOCKQUOTE ancestor. Works with the structured selection's Point
 * rather than with a live DOM node.
 */
function pointIsInsideBlockquote(editor: Editor, p: Point): boolean {
    // Resolve the path to a DOM node and walk up.
    let cursor: Node = editor.editorArea;
    for (let i = 0; i < p.path.length; i++) {
        const idx = p.path[i];
        const kids = cursor.childNodes;
        if (idx < 0 || idx >= kids.length) return false;
        cursor = kids[idx];
    }
    let node: Node | null = cursor;
    while (node && node !== editor.editorArea) {
        if ((node as HTMLElement).tagName === 'BLOCKQUOTE') return true;
        node = node.parentNode;
    }
    return false;
}

export const BlockQuotePlugin: Plugin = {
    name: 'block-quote',
    init(editor: Editor) {
        const btn = editor.addToolbarButton(icons.quote, 'Block Quote', () => {
            const sel = editor.getSelection();
            if (sel.kind === 'none') return;
            const at = sel.kind === 'caret' ? sel.at : sel.anchor;

            if (pointIsInsideBlockquote(editor, at)) {
                editor.execCommand('formatBlock', '<p>');
            } else {
                editor.execCommand('formatBlock', '<blockquote>');
            }
        });

        // Cache anchor path + active state; unmoved selections skip the DOM walk.
        let lastPathKey = '';
        let lastActive = false;

        const updateActive = () => {
            const sel = editor.getSelection();
            if (sel.kind === 'none') return;
            const at = sel.kind === 'caret' ? sel.at : sel.anchor;
            const key = at.path.join('.');
            if (key === lastPathKey) return;
            lastPathKey = key;

            const inBlockquote = pointIsInsideBlockquote(editor, at);
            if (inBlockquote === lastActive) return;
            lastActive = inBlockquote;
            btn.classList.toggle('play-editor-btn-active', inBlockquote);
        };

        const unsub = editor.onSelectionChange(updateActive);
        editor.onDestroy(unsub);
    }
};
