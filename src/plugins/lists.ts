import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const ListsPlugin: Plugin = {
    name: 'lists',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.listUnordered, 'Unordered List', () => {
            editor.exec('insertUnorderedList');
        });

        editor.addToolbarButton(icons.listOrdered, 'Ordered List', () => {
            editor.exec('insertOrderedList');
        });

        editor.addToolbarButton(icons.indent, 'Indent', () => {
            editor.exec('indent');
        });

        editor.addToolbarButton(icons.outdent, 'Outdent', () => {
            editor.exec('outdent');
        });
    }
};
