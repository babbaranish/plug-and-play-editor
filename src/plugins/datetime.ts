import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export const DateTimePlugin: Plugin = {
    name: 'datetime',
    init(editor: Editor) {
        editor.addToolbarDivider();

        // Insert Date
        editor.addToolbarButton(icons.calendar, 'Insert Date', () => {
            const now = new Date();
            const date = now.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            editor.exec('insertHTML', `<time class="play-editor-datetime" datetime="${now.toISOString()}">${date}</time>`);
        });

        // Insert Time
        editor.addToolbarButton(icons.clock, 'Insert Time', () => {
            const now = new Date();
            const time = now.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
            });
            editor.exec('insertHTML', `<time class="play-editor-datetime" datetime="${now.toISOString()}">${time}</time>`);
        });
    }
};
