import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const CodeBlockPlugin: Plugin = {
    name: 'code-block',
    init(editor: Editor) {
        editor.addToolbarDivider();

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
        });

        // Code block
        editor.addToolbarButton(icons.braces, 'Code Block', () => {
            const sel = window.getSelection();
            const selected = sel?.toString() || '// your code here';

            const html = `
                <pre class="play-editor-code-block"><code>${escapeHtml(selected)}</code></pre>
                <p><br></p>
            `;
            editor.exec('insertHTML', html);
        });

        // HTML Source View toggle
        let isSourceView = false;
        const sourceBtn = editor.addToolbarButton(icons.code, 'Toggle HTML Source', () => {
            isSourceView = !isSourceView;

            if (isSourceView) {
                const html = editor.editorArea.innerHTML;
                editor.editorArea.innerText = html;
                editor.editorArea.classList.add('play-editor-source-view');
                sourceBtn.classList.add('play-editor-btn-active');
            } else {
                const html = editor.editorArea.innerText;
                editor.editorArea.innerHTML = html;
                editor.editorArea.classList.remove('play-editor-source-view');
                sourceBtn.classList.remove('play-editor-btn-active');
                editor.textArea.value = editor.editorArea.innerHTML;
            }
        });
    }
};

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
