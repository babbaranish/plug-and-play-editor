import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const FONT_FAMILIES: [string, string][] = [
    ['', 'Font Family'],
    ['Arial, sans-serif', 'Arial'],
    ['Helvetica, sans-serif', 'Helvetica'],
    ['Georgia, serif', 'Georgia'],
    ['"Times New Roman", Times, serif', 'Times New Roman'],
    ['"Courier New", Courier, monospace', 'Courier New'],
    ['Verdana, Geneva, sans-serif', 'Verdana'],
    ['"Trebuchet MS", Helvetica, sans-serif', 'Trebuchet MS'],
    ['"Comic Sans MS", cursive, sans-serif', 'Comic Sans MS'],
    ['Impact, Charcoal, sans-serif', 'Impact'],
    ['"Lucida Console", Monaco, monospace', 'Lucida Console'],
    ['Tahoma, Geneva, sans-serif', 'Tahoma'],
];

export const FontFamilyPlugin: Plugin = {
    name: 'font-family',
    init(editor: Editor) {
        const wrapper = document.createElement('div');
        wrapper.className = 'play-editor-select-wrapper';

        const select = document.createElement('select');
        select.className = 'play-editor-fontfamily-select';
        select.setAttribute('aria-label', 'Font family');
        select.title = 'Font Family';

        FONT_FAMILIES.forEach(([value, label]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            if (value) opt.style.fontFamily = value;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            const family = select.value;
            if (!family) return;
            editor.exec('fontName', family);
            select.value = '';
        });

        wrapper.appendChild(select);
        editor.toolbar.appendChild(wrapper);
    },
};
