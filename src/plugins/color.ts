import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const ColorPlugin: Plugin = {
    name: 'color',
    init(editor: Editor) {
        editor.addToolbarDivider();

        const createColorPicker = (command: string, iconSvg: string, title: string) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'play-editor-color-picker';
            wrapper.title = title;

            const input = document.createElement('input');
            input.type = 'color';
            input.value = '#000000';

            const icon = document.createElement('span');
            icon.innerHTML = iconSvg;

            wrapper.appendChild(icon);
            wrapper.appendChild(input);

            input.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                editor.exec(command, target.value);
            });

            editor.toolbar.appendChild(wrapper);
            return wrapper;
        };

        createColorPicker('foreColor', icons.textColor, 'Text Color');
        createColorPicker('hiliteColor', icons.highlighter, 'Background Color');
    }
};
