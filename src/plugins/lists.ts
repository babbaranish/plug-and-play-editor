import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const ListsPlugin: Plugin = {
    name: 'lists',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.listUnordered, 'Unordered List', () => {
            editor.execCommand('insertUnorderedList');
        });

        editor.addToolbarButton(icons.listOrdered, 'Ordered List', () => {
            editor.execCommand('insertOrderedList');
        });

        editor.addToolbarButton(icons.indent, 'Indent', () => {
            editor.execCommand('indent');
        });

        editor.addToolbarButton(icons.outdent, 'Outdent', () => {
            editor.execCommand('outdent');
        });
    }
};
