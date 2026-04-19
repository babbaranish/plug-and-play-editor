import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal, openInfoModal } from '../core/modal';

function isValidImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true;
        if (parsed.protocol === 'data:') {
            // Only accept data URLs that declare an image MIME type.
            // Matches e.g. `data:image/png;base64,...` / `data:image/svg+xml,...`.
            return /^data:image\//i.test(url);
        }
        return false;
    } catch {
        return false;
    }
}

function sanitizeEmbedCode(html: string): string | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const iframe = doc.querySelector('iframe');
    if (!iframe) return null;

    const src = iframe.getAttribute('src');
    if (!src) return null;

    try {
        const url = new URL(src);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
    } catch {
        return null;
    }

    const clean = document.createElement('iframe');
    clean.src = src;
    clean.setAttribute('frameborder', '0');
    clean.setAttribute('allowfullscreen', '');
    // Security hardening: isolate third-party embeds from the host page.
    clean.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
    clean.setAttribute('referrerpolicy', 'no-referrer');
    clean.setAttribute('loading', 'lazy');
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

        editor.addToolbarButton(icons.image, 'Insert Image (URL)', () => {
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

            openFormModal(editor, {
                title: 'Insert Image',
                fields: [
                    {
                        name: 'url',
                        label: 'Image URL',
                        type: 'url',
                        value: 'https://',
                        placeholder: 'https://example.com/image.png'
                    }
                ],
                submitLabel: 'Insert',
                onSubmit: (values, { showError, close }) => {
                    const url = values.url.trim();
                    if (!url) {
                        showError('Image URL is required.');
                        return;
                    }
                    if (!isValidImageUrl(url)) {
                        showError('Invalid image URL. Only http, https, and data URLs are allowed.');
                        return;
                    }

                    if (savedRange) {
                        const s = window.getSelection();
                        s?.removeAllRanges();
                        s?.addRange(savedRange);
                    }
                    editor.editorArea.focus();
                    editor.execCommand('insertImage', url);

                    const images = editor.editorArea.querySelectorAll('img');
                    images.forEach(img => {
                        if (!img.style.maxWidth) {
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                        }
                    });

                    close();
                }
            });
        });

        // Insert Image via File Select — scoped to editor container instead of document.body
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        editor.container.appendChild(fileInput);

        editor.onDestroy(() => fileInput.remove());

        editor.addToolbarButton(icons.imageUpload, 'Upload Image', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            // Defence-in-depth: the `accept="image/*"` attribute is a UI hint, not a
            // validation — users can still select any file through platform file pickers.
            if (!file.type.startsWith('image/')) {
                openInfoModal(editor, {
                    title: 'Upload Failed',
                    message: `Only image files are supported (got: ${file.type || 'unknown'}).`
                });
                fileInput.value = '';
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                openInfoModal(editor, {
                    title: 'Upload Failed',
                    message: 'Image too large. Maximum size is 10MB.'
                });
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
                openInfoModal(editor, {
                    title: 'Upload Failed',
                    message: 'Failed to read the image file.'
                });
            };
            reader.readAsDataURL(file);

            fileInput.value = '';
        });

        editor.addToolbarButton(icons.video, 'Insert Video/Media', () => {
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

            openFormModal(editor, {
                title: 'Insert Video / Embed',
                fields: [
                    {
                        name: 'embed',
                        label: 'Iframe embed code',
                        type: 'textarea',
                        value: '',
                        placeholder: '<iframe src="https://..." width="560" height="315"></iframe>'
                    }
                ],
                submitLabel: 'Insert',
                onSubmit: (values, { showError, close }) => {
                    const embedCode = values.embed.trim();
                    if (!embedCode) {
                        showError('Embed code is required.');
                        return;
                    }
                    const sanitized = sanitizeEmbedCode(embedCode);
                    if (!sanitized) {
                        showError('Invalid embed code. Only iframes with http/https sources are allowed.');
                        return;
                    }

                    if (savedRange) {
                        const s = window.getSelection();
                        s?.removeAllRanges();
                        s?.addRange(savedRange);
                    }
                    editor.editorArea.focus();
                    editor.execCommand('insertHTML', sanitized);

                    close();
                }
            });
        });
    }
};
