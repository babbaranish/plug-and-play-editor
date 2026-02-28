import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const AlignmentPlugin: Plugin = {
    name: 'alignment',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.alignLeft, 'Align Left', () => {
            editor.exec('justifyLeft');
        });

        editor.addToolbarButton(icons.alignCenter, 'Align Center', () => {
            editor.exec('justifyCenter');
        });

        editor.addToolbarButton(icons.alignRight, 'Align Right', () => {
            editor.exec('justifyRight');
        });

        editor.addToolbarButton(icons.alignJustify, 'Justify', () => {
            editor.exec('justifyFull');
        });
    }
};
