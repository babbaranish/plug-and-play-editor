import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

const EMOJI_CATEGORIES: Record<string, string[]> = {
    'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡'],
    'Gestures': ['👍', '👎', '👏', '🙌', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👋', '✋', '🖐️', '🖖', '💪', '🦾'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    'Objects': ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '⭐', '🌟', '💡', '🔥', '✨', '💯', '✅', '❌', '⚠️', '📌', '📎', '🔗', '📝', '📅', '📊', '📈'],
    'Arrows': ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↔️', '↕️', '🔄', '🔃'],
};

export const EmojiPlugin: Plugin = {
    name: 'emoji',
    init(editor: Editor) {
        let picker: HTMLDivElement | null = null;

        editor.addToolbarButton(icons.smile, 'Insert Emoji', () => {
            if (picker) {
                picker.remove();
                picker = null;
                return;
            }

            // Save selection before opening picker
            const sel = window.getSelection();
            let savedRange: Range | null = null;
            if (sel && sel.rangeCount > 0) {
                savedRange = sel.getRangeAt(0).cloneRange();
            }

            picker = document.createElement('div');
            picker.className = 'play-editor-emoji-picker';

            // Category tabs
            const tabs = document.createElement('div');
            tabs.className = 'play-editor-emoji-tabs';

            const grid = document.createElement('div');
            grid.className = 'play-editor-emoji-grid';

            const categories = Object.keys(EMOJI_CATEGORIES);

            function showCategory(cat: string) {
                grid.innerHTML = '';
                EMOJI_CATEGORIES[cat].forEach(emoji => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'play-editor-emoji-item';
                    btn.textContent = emoji;
                    btn.addEventListener('mousedown', (e) => {
                        e.preventDefault();

                        // Restore saved selection
                        editor.editorArea.focus();
                        if (savedRange) {
                            sel?.removeAllRanges();
                            sel?.addRange(savedRange);
                        }

                        editor.exec('insertHTML', emoji);

                        // Update saved range for next insert
                        if (sel && sel.rangeCount > 0) {
                            savedRange = sel.getRangeAt(0).cloneRange();
                        }
                    });
                    grid.appendChild(btn);
                });
            }

            categories.forEach((cat, idx) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'play-editor-emoji-tab';
                if (idx === 0) tab.classList.add('active');
                tab.textContent = cat;
                tab.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    tabs.querySelectorAll('.play-editor-emoji-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    showCategory(cat);
                });
                tabs.appendChild(tab);
            });

            picker.appendChild(tabs);
            picker.appendChild(grid);

            // Position below the toolbar
            editor.container.style.position = 'relative';
            editor.container.appendChild(picker);

            // Show first category
            showCategory(categories[0]);

            // Close on outside click
            const closeHandler = (e: MouseEvent) => {
                if (picker && !picker.contains(e.target as Node)) {
                    picker.remove();
                    picker = null;
                    document.removeEventListener('mousedown', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
        });
    }
};
