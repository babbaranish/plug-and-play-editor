import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const FormattingPlugin: Plugin = {
    name: 'formatting',
    init(editor: Editor) {
        editor.addToolbarButton(icons.bold, 'Bold', () => {
            editor.exec('bold');
        });

        editor.addToolbarButton(icons.italic, 'Italic', () => {
            editor.exec('italic');
        });

        editor.addToolbarButton(icons.underline, 'Underline', () => {
            editor.exec('underline');
        });

        editor.addToolbarButton(icons.strikethrough, 'Strikethrough', () => {
            editor.exec('strikeThrough');
        });
    }
};
