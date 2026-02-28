import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

export const PasteImagePlugin: Plugin = {
    name: 'paste-image',
    init(editor: Editor) {
        editor.editorArea.addEventListener('paste', (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    e.preventDefault();

                    const file = item.getAsFile();
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const dataUrl = event.target?.result as string;
                        if (dataUrl) {
                            const img = document.createElement('img');
                            img.src = dataUrl;
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                            img.style.borderRadius = '6px';
                            img.style.margin = '0.5em 0';

                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                range.deleteContents();
                                range.insertNode(img);

                                // Move cursor after image
                                range.setStartAfter(img);
                                range.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(range);
                            } else {
                                editor.editorArea.appendChild(img);
                            }

                            // Sync content
                            editor.textArea.value = editor.editorArea.innerHTML;
                        }
                    };
                    reader.readAsDataURL(file);
                    break; // Process only the first image
                }
            }
        });
    }
};
