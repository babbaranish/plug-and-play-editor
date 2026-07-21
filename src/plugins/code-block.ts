import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const CodeBlockPlugin: Plugin = {
    name: 'code-block',
    init(editor: Editor) {
        editor.addToolbarDivider();
        const group = editor.addToolbarGroup(icons.code, 'Code');

        // Inline code
        editor.addToolbarButton(icons.code, 'Inline Code', () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;

            const range = sel.getRangeAt(0);
            const selected = range.toString();

            if (selected) {
                const code = document.createElement('code');
                code.className = 'play-editor-inline-code';
                code.textContent = selected;
                range.deleteContents();
                range.insertNode(code);

                // Move cursor after the code element
                range.setStartAfter(code);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                const code = document.createElement('code');
                code.className = 'play-editor-inline-code';
                code.innerHTML = '&nbsp;';
                range.insertNode(code);
                range.selectNodeContents(code);
                sel.removeAllRanges();
                sel.addRange(range);
            }

            editor.textArea.value = editor.editorArea.innerHTML;
        }, undefined, group);

        // Code block
        editor.addToolbarButton(icons.braces, 'Code Block', () => {
            const sel = window.getSelection();
            const selected = sel?.toString() || '// your code here';

            const html = `
                <pre class="play-editor-code-block"><code>${escapeHtml(selected)}</code></pre>
                <p><br></p>
            `;
            editor.execCommand('insertHTML', html);
        }, undefined, group);

        // HTML Source View toggle
        let isSourceView = false;
        let unregisterContentSource: (() => void) | null = null;

        // getContent()/onChange/onInput must reflect editorArea.innerText while this
        // mode is active, not editorArea.innerHTML (which is HTML-escaped display
        // text here, not real markup). Gated on isSourceView since this listener is
        // permanent; also ignores the synthetic event notifyContentChange() itself
        // dispatches on editorArea, or calling it from here would recurse forever.
        const onEditorAreaInput = (e: Event) => {
            if (!isSourceView) return;
            if ((e as Event & { __peSynthetic?: boolean }).__peSynthetic) return;
            editor.notifyContentChange();
        };
        editor.editorArea.addEventListener('input', onEditorAreaInput);
        editor.onDestroy(() => editor.editorArea.removeEventListener('input', onEditorAreaInput));

        const sourceBtn = editor.addToolbarButton(icons.code, 'Toggle HTML Source', () => {
            isSourceView = !isSourceView;

            if (isSourceView) {
                const html = editor.editorArea.innerHTML;
                editor.editorArea.innerText = html;
                editor.editorArea.classList.add('play-editor-source-view');
                sourceBtn.classList.add('play-editor-btn-active');
                unregisterContentSource = editor.registerContentSource(() => editor.editorArea.innerText);
            } else {
                const html = editor.editorArea.innerText;
                editor.editorArea.innerHTML = html;
                editor.editorArea.classList.remove('play-editor-source-view');
                sourceBtn.classList.remove('play-editor-btn-active');
                editor.textArea.value = editor.editorArea.innerHTML;
                unregisterContentSource?.();
                unregisterContentSource = null;
            }
        }, undefined, group);

        editor.onDestroy(() => {
            unregisterContentSource?.();
            unregisterContentSource = null;
        });
    }
};

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
