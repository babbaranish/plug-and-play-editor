import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';

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
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

            openFormModal(editor, {
                title: 'Insert Link',
                fields: [
                    {
                        name: 'url',
                        label: 'Link URL',
                        type: 'url',
                        value: 'https://',
                        placeholder: 'https://example.com'
                    }
                ],
                submitLabel: 'Insert',
                onSubmit: (values, { showError, close }) => {
                    const url = values.url.trim();
                    if (!url) {
                        showError('URL is required.');
                        return;
                    }
                    if (!isValidUrl(url)) {
                        showError('Invalid URL. Only http, https, and mailto links are allowed.');
                        return;
                    }

                    if (savedRange) {
                        const s = window.getSelection();
                        s?.removeAllRanges();
                        s?.addRange(savedRange);
                    }
                    editor.editorArea.focus();
                    editor.execCommand('createLink', url);

                    const links = editor.editorArea.querySelectorAll('a');
                    links.forEach(a => {
                        if (!a.target) a.target = '_blank';
                        if (!a.rel) a.rel = 'noopener noreferrer';
                    });

                    close();
                }
            });
        });

        editor.addToolbarButton(icons.unlink, 'Unlink', () => {
            editor.execCommand('unlink');
        });
    }
};
