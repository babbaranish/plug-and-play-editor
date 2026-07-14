import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const FormattingPlugin: Plugin = {
    name: 'formatting',
    init(editor: Editor) {
        editor.addToolbarButton(icons.bold, 'Bold', () => {
            editor.execCommand('bold');
        }, 'bold');

        editor.addToolbarButton(icons.italic, 'Italic', () => {
            editor.execCommand('italic');
        }, 'italic');

        editor.addToolbarButton(icons.underline, 'Underline', () => {
            editor.execCommand('underline');
        }, 'underline');

        editor.addToolbarButton(icons.strikethrough, 'Strikethrough', () => {
            editor.execCommand('strikeThrough');
        }, 'strikeThrough');

        // Headings dropdown
        const wrapper = document.createElement('div');
        wrapper.className = 'play-editor-select-wrapper';

        const select = document.createElement('select');
        select.className = 'play-editor-heading-select';
        select.setAttribute('aria-label', 'Text style');
        select.title = 'Text Style';

        const options: [string, string][] = [
            ['', 'Paragraph'],
            ['h1', 'Heading 1'],
            ['h2', 'Heading 2'],
            ['h3', 'Heading 3'],
            ['h4', 'Heading 4'],
            ['h5', 'Heading 5'],
            ['h6', 'Heading 6'],
        ];

        options.forEach(([value, label]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            const tag = select.value;
            if (tag) {
                editor.execCommand('formatBlock', `<${tag}>`);
            } else {
                editor.execCommand('formatBlock', '<p>');
            }
            select.value = '';
        });

        wrapper.appendChild(select);
        editor.toolbar.appendChild(wrapper);
    }
};

export const UndoRedoPlugin: Plugin = {
    name: 'undo-redo',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.undo, 'Undo', () => {
            editor.execCommand('undo');
        });

        editor.addToolbarButton(icons.redo, 'Redo', () => {
            editor.execCommand('redo');
        });
    }
};
