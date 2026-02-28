import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const PageBreakPlugin: Plugin = {
    name: 'page-break',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.minus, 'Horizontal Rule', () => {
            editor.exec('insertHorizontalRule');
        });

        editor.addToolbarButton(icons.fileBreak, 'Page Break', () => {
            const html = `
        <div class="play-editor-page-break" contenteditable="false">
          <span>Page Break</span>
        </div>
        <p><br></p>
      `;
            editor.exec('insertHTML', html);
        });
    }
};
