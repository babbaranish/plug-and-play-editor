import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export interface PreviewPluginOptions {
    /** Sample data to replace token placeholders with */
    sampleData?: Record<string, string>;
}

const DEFAULT_SAMPLE_DATA: Record<string, string> = {
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    email: 'alice@example.com',
    company: 'Acme Inc',
    unsubscribe_url: '#unsubscribe',
    preferences_url: '#preferences',
    current_year: new Date().getFullYear().toString(),
    current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
};

export function createPreviewPlugin(options?: PreviewPluginOptions): Plugin {
    const sampleData = { ...DEFAULT_SAMPLE_DATA, ...options?.sampleData };

    return {
        name: 'preview',
        init(editor: Editor) {
            editor.addToolbarDivider();

            let isPreview = false;
            let savedHtml = '';
            let exitBtn: HTMLDivElement | null = null;

            function enterPreview() {
                isPreview = true;
                savedHtml = editor.editorArea.innerHTML;

                // Replace token spans with sample values
                const tokens = editor.editorArea.querySelectorAll('.play-editor-token');
                tokens.forEach(span => {
                    const key = (span as HTMLElement).dataset.token;
                    if (key && sampleData[key]) {
                        (span as HTMLElement).dataset.originalText = span.textContent || '';
                        span.textContent = sampleData[key];
                        (span as HTMLElement).classList.add('play-editor-token-preview');
                    }
                });

                // Also replace raw {{token}} patterns in text nodes
                const tw = document.createTreeWalker(editor.editorArea, NodeFilter.SHOW_TEXT);
                const textNodes: Text[] = [];
                while (tw.nextNode()) textNodes.push(tw.currentNode as Text);
                textNodes.forEach(node => {
                    if (node.textContent && /\{\{.+?\}\}/.test(node.textContent)) {
                        const replaced = node.textContent.replace(/\{\{(.+?)\}\}/g, (_, key) => {
                            return sampleData[key.trim()] || `{{${key}}}`;
                        });
                        node.textContent = replaced;
                    }
                });

                // Hide toolbar, show exit button
                editor.toolbar.style.display = 'none';
                editor.editorArea.contentEditable = 'false';
                editor.container.classList.add('play-editor-preview-mode');

                // Exit button — uses safe DOM construction (no user input)
                exitBtn = document.createElement('div');
                exitBtn.className = 'play-editor-preview-exit';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'play-editor-preview-exit-icon';
                // Safe: icons.eyeOff is a hardcoded SVG string from our icons module
                iconSpan.innerHTML = icons.eyeOff;
                const textSpan = document.createElement('span');
                textSpan.textContent = 'Exit Preview';
                exitBtn.appendChild(iconSpan);
                exitBtn.appendChild(textSpan);
                exitBtn.addEventListener('click', exitPreview);
                editor.container.insertBefore(exitBtn, editor.editorArea);

                previewBtn.classList.add('play-editor-btn-active');
            }

            function exitPreview() {
                if (!isPreview) return;
                isPreview = false;

                // Restore content
                editor.editorArea.innerHTML = savedHtml;

                // Show toolbar, re-enable editing
                editor.toolbar.style.display = '';
                editor.editorArea.contentEditable = 'true';
                editor.container.classList.remove('play-editor-preview-mode');

                if (exitBtn) { exitBtn.remove(); exitBtn = null; }
                previewBtn.classList.remove('play-editor-btn-active');
            }

            const previewBtn = editor.addToolbarButton(icons.eye, 'Preview Mode', () => {
                if (isPreview) {
                    exitPreview();
                } else {
                    enterPreview();
                }
            });

            editor.onDestroy(() => {
                if (isPreview) exitPreview();
            });
        }
    };
}

/** Pre-configured preview plugin with default sample data */
export const PreviewPlugin = createPreviewPlugin();
