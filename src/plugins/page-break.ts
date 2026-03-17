import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const PageBreakPlugin: Plugin = {
    name: 'page-break',
    init(editor: Editor) {
        editor.addToolbarDivider();

        // Create "Insert Block" group for structural elements
        const group = editor.addToolbarGroup(icons.fileBreak, 'Insert Block');

        editor.addToolbarButton(icons.minus, 'Horizontal Rule', () => {
            editor.execCommand('insertHorizontalRule');
        }, undefined, group);

        editor.addToolbarButton(icons.fileBreak, 'Page Break', () => {
            const html = `
        <div class="play-editor-page-break" contenteditable="false">
          <span>Page Break</span>
        </div>
        <p><br></p>
      `;
            editor.execCommand('insertHTML', html);
        }, undefined, group);

        // Expose group for other plugins to add to
        (editor as any)._insertGroup = group;
    }
};
