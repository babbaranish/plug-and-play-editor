import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const TocPlugin: Plugin = {
    name: 'toc',
    init(editor: Editor) {
        editor.addToolbarButton(icons.listTree, 'Insert Table of Contents', () => {
            const headings = editor.editorArea.querySelectorAll('h1, h2, h3, h4, h5, h6');
            if (headings.length === 0) {
                alert('No headings found to generate a Table of Contents.');
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
