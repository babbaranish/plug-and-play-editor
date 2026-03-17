import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

function isValidImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'data:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function sanitizeEmbedCode(html: string): string | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const iframe = doc.querySelector('iframe');
    if (!iframe) return null;

    // Only allow safe iframe attributes
    const src = iframe.getAttribute('src');
    if (!src) return null;

    try {
        const url = new URL(src);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
    } catch {
        return null;
    }

    // Build a clean iframe
    const clean = document.createElement('iframe');
    clean.src = src;
    clean.setAttribute('frameborder', '0');
    clean.setAttribute('allowfullscreen', '');
    clean.style.maxWidth = '100%';

    const width = iframe.getAttribute('width');
    const height = iframe.getAttribute('height');
    if (width) clean.width = width;
    if (height) clean.height = height;

    const wrapper = document.createElement('div');
    wrapper.className = 'play-editor-media-wrapper';
    wrapper.appendChild(clean);
    return wrapper.outerHTML;
}

export const MediaPlugin: Plugin = {
    name: 'media',
    destroy() {
        // fileInput cleanup handled via editor.onDestroy
    },
    init(editor: Editor) {
        editor.addToolbarDivider();

        // Insert Image via URL
        editor.addToolbarButton(icons.image, 'Insert Image (URL)', () => {
            const url = prompt('Enter image URL:', 'https://');
            if (!url) return;

            if (!isValidImageUrl(url)) {
                alert('Invalid image URL.');
                return;
            }

            editor.exec('insertImage', url);

            const images = editor.editorArea.querySelectorAll('img');
            images.forEach(img => {
                if (!img.style.maxWidth) {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                }
            });
        });

        // Insert Image via File Select — scoped to editor container instead of document.body
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        editor.container.appendChild(fileInput);

        // Clean up file input on editor destroy
        editor.onDestroy(() => fileInput.remove());

        editor.addToolbarButton(icons.imageUpload, 'Upload Image', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            // Validate file size (10MB max)
            if (file.size > 10 * 1024 * 1024) {
                alert('Image too large. Maximum size is 10MB.');
                fileInput.value = '';
                return;
            }

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
            reader.onerror = () => {
                alert('Failed to read the image file.');
            };
            reader.readAsDataURL(file);

            // Reset so the same file can be re-selected
            fileInput.value = '';
        });

        // Insert Video/Embed — sanitized
        editor.addToolbarButton(icons.video, 'Insert Video/Media', () => {
            const embedCode = prompt('Enter iframe embed code:', '<iframe src="..."></iframe>');
            if (!embedCode) return;

            const sanitized = sanitizeEmbedCode(embedCode);
            if (!sanitized) {
                alert('Invalid embed code. Only iframes with http/https sources are allowed.');
                return;
            }
            editor.exec('insertHTML', sanitized);
        });
    }
};
