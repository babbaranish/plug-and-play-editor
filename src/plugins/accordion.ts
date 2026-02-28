import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const AccordionPlugin: Plugin = {
    name: 'accordion',
    init(editor: Editor) {
        editor.addToolbarButton(icons.chevronDown, 'Insert Accordion', () => {
            const html = `
        <details class="play-editor-accordion" open>
            <summary class="play-editor-accordion-title">Click to expand</summary>
            <div class="play-editor-accordion-content">
                <p>Accordion content goes here...</p>
            </div>
        </details>
        <p><br></p>
      `;

            editor.exec('insertHTML', html);
        });
    }
};
