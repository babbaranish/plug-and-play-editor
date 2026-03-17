import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

export const LinksPlugin: Plugin = {
    name: 'links',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.link, 'Insert Link', () => {
            const url = prompt('Enter the link URL:', 'https://');
            if (!url) return;

            if (!isValidUrl(url)) {
                alert('Invalid URL. Only http, https, and mailto links are allowed.');
                return;
            }

            editor.exec('createLink', url);

            const links = editor.editorArea.querySelectorAll('a');
            links.forEach(a => {
                if (!a.target) a.target = '_blank';
                if (!a.rel) a.rel = 'noopener noreferrer';
            });
        });

        editor.addToolbarButton(icons.unlink, 'Unlink', () => {
            editor.exec('unlink');
        });
    }
};
