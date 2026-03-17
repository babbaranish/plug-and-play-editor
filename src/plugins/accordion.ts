import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const AccordionPlugin: Plugin = {
    name: 'accordion',
    init(editor: Editor) {
        // Join the "Insert Block" group created by PageBreakPlugin
        const group = (editor as any)._insertGroup as HTMLDivElement | undefined;
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

            editor.execCommand('insertHTML', html);
        }, undefined, group);
    }
};
