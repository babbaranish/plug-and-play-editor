import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48];

export const FontSizePlugin: Plugin = {
    name: 'font-size',
    init(editor: Editor) {
        const wrapper = document.createElement('div');
        wrapper.className = 'play-editor-select-wrapper';

        const select = document.createElement('select');
        select.className = 'play-editor-fontsize-select';
        select.setAttribute('aria-label', 'Font size');

        // Default option
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Size';
        select.appendChild(defaultOpt);

        FONT_SIZES.forEach(size => {
            const opt = document.createElement('option');
            opt.value = String(size);
            opt.textContent = `${size}px`;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            const px = select.value;
            if (!px) return;

            editor.editorArea.focus();

            // Use fontSize 7 as a sentinel, then replace <font> tags with styled <span>
            document.execCommand('fontSize', false, '7');

            const fonts = editor.editorArea.querySelectorAll('font[size="7"]');
            fonts.forEach(font => {
                const span = document.createElement('span');
                span.style.fontSize = px + 'px';
                while (font.firstChild) span.appendChild(font.firstChild);
                font.parentNode?.replaceChild(span, font);
            });

            editor.textArea.value = editor.editorArea.innerHTML;
            select.value = '';
        });

        wrapper.appendChild(select);
        editor.toolbar.appendChild(wrapper);
    }
};
