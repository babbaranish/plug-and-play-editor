import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const DirectionalityPlugin: Plugin = {
    name: 'directionality',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.ltr, 'Left to Right', () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;

            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode as Node;
            }

            const element = node as HTMLElement;

            if (element && element !== editor.editorArea) {
                element.setAttribute('dir', 'ltr');
            } else {
                editor.editorArea.setAttribute('dir', 'ltr');
            }
        });

        editor.addToolbarButton(icons.rtl, 'Right to Left', () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;

            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode as Node;
            }

            const element = node as HTMLElement;

            if (element && element !== editor.editorArea) {
                element.setAttribute('dir', 'rtl');
            } else {
                editor.editorArea.setAttribute('dir', 'rtl');
            }
        });
    }
};
