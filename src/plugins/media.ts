import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const MediaPlugin: Plugin = {
    name: 'media',
    init(editor: Editor) {
        editor.addToolbarDivider();

        // Insert Image via URL
        editor.addToolbarButton(icons.image, 'Insert Image (URL)', () => {
            const url = prompt('Enter image URL:', 'https://');
            if (url) {
                editor.exec('insertImage', url);

                const images = editor.editorArea.querySelectorAll('img');
                images.forEach(img => {
                    if (!img.style.maxWidth) {
                        img.style.maxWidth = '100%';
                        img.style.height = 'auto';
                    }
                });
            }
        });

        // Insert Image via File Select
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        editor.addToolbarButton(icons.imageUpload, 'Upload Image', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
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

                    editor.editorArea.focus();
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(img);
                        range.setStartAfter(img);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        editor.editorArea.appendChild(img);
                    }

                    editor.textArea.value = editor.editorArea.innerHTML;
                }
            };
            reader.readAsDataURL(file);

            // Reset so the same file can be re-selected
            fileInput.value = '';
        });

        // Insert Video/Embed
        editor.addToolbarButton(icons.video, 'Insert Video/Media', () => {
            const embedCode = prompt('Enter iframe embed code:', '<iframe src="..."></iframe>');
            if (embedCode) {
                editor.exec('insertHTML', embedCode);
            }
        });
    }
};
