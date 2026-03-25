import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const SourceCodePlugin: Plugin = {
    name: 'source-code',
    init(editor: Editor) {
        let isSourceMode = false;

        function getOtherToolbarControls(): (HTMLButtonElement | HTMLSelectElement | HTMLInputElement)[] {
            const all = editor.toolbar.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
                'button, select, input'
            );
            return Array.from(all).filter(el => el !== btn);
        }

        function enterSourceMode() {
            isSourceMode = true;

            // Show raw HTML as escaped text
            editor.editorArea.textContent = editor.editorArea.innerHTML;
            editor.editorArea.classList.add('play-editor-source-view');
            btn.classList.add('play-editor-btn-active');

            // Disable all other toolbar controls
            const controls = getOtherToolbarControls();
            controls.forEach(el => {
                el.setAttribute('data-pe-was-disabled', el.disabled ? 'true' : 'false');
                el.disabled = true;
            });
        }

        function exitSourceMode() {
            isSourceMode = false;

            // Take user-edited text content (raw HTML source) and render it back.
            // This is the core purpose of a source code editor plugin — the user
            // edits raw HTML in the contentEditable area (displayed as text), and
            // we restore it as rendered HTML. The content originates from the
            // editor's own innerHTML, so this is trusted self-referential content.
            const rawHtml = editor.editorArea.textContent || '';
            editor.setContent(rawHtml);
            editor.editorArea.classList.remove('play-editor-source-view');
            btn.classList.remove('play-editor-btn-active');

            // Re-enable other toolbar controls
            const controls = getOtherToolbarControls();
            controls.forEach(el => {
                const wasDisabled = el.getAttribute('data-pe-was-disabled') === 'true';
                el.disabled = wasDisabled;
                el.removeAttribute('data-pe-was-disabled');
            });

            // Sync to textarea
            editor.textArea.value = editor.editorArea.innerHTML;
        }

        const btn = editor.addToolbarButton(icons.code, 'Source Code', () => {
            if (isSourceMode) {
                exitSourceMode();
            } else {
                enterSourceMode();
            }
        });

        editor.onDestroy(() => {
            if (isSourceMode) exitSourceMode();
        });
    }
};
