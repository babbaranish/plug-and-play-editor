import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const LinksPlugin: Plugin = {
    name: 'links',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.link, 'Insert Link', () => {
            const url = prompt('Enter the link URL:', 'https://');
            if (url) {
                editor.exec('createLink', url);

                const links = editor.editorArea.querySelectorAll('a');
                links.forEach(a => {
                    if (!a.target) a.target = '_blank';
                });
            }
        });

        editor.addToolbarButton(icons.unlink, 'Unlink', () => {
            editor.exec('unlink');
        });
    }
};
