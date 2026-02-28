import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const TocPlugin: Plugin = {
    name: 'toc',
    init(editor: Editor) {
        editor.addToolbarButton(icons.listTree, 'Insert Table of Contents', () => {
            const headings = editor.editorArea.querySelectorAll('h1, h2, h3, h4, h5, h6');
            if (headings.length === 0) {
                const toast = document.createElement('div');
                toast.textContent = 'No headings found to generate a Table of Contents.';
                toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f8fafc;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15);opacity:0;transition:opacity .3s';
                document.body.appendChild(toast);
                requestAnimationFrame(() => toast.style.opacity = '1');
                setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
                return;
            }

            let tocHtml = '<div class="play-editor-toc" contenteditable="false"><h3>Table of Contents</h3><ul>';

            headings.forEach((heading, index) => {
                const id = `toc-heading-${index}`;
                heading.id = id;

                const level = parseInt(heading.tagName.charAt(1));
                const indent = (level - 1) * 20;

                tocHtml += `<li style="margin-left: ${indent}px"><a href="#${id}">${heading.textContent}</a></li>`;
            });

            tocHtml += '</ul></div><p><br></p>';

            editor.exec('insertHTML', tocHtml);
        });
    }
};
