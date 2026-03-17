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
        let activeCloseHandler: ((e: MouseEvent) => void) | null = null;

        function closePicker() {
            if (picker) {
                picker.remove();
                picker = null;
            }
            if (activeCloseHandler) {
                document.removeEventListener('mousedown', activeCloseHandler);
                activeCloseHandler = null;
            }
        }

        const btnEl = editor.addToolbarButton(icons.smile, 'Insert Emoji', () => {
            if (picker) {
                closePicker();
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
            picker.setAttribute('role', 'dialog');
            picker.setAttribute('aria-label', 'Emoji picker');

            // Category tabs
            const tabs = document.createElement('div');
            tabs.className = 'play-editor-emoji-tabs';
            tabs.setAttribute('role', 'tablist');

            const grid = document.createElement('div');
            grid.className = 'play-editor-emoji-grid';
            grid.setAttribute('role', 'grid');

            const categories = Object.keys(EMOJI_CATEGORIES);

            function showCategory(cat: string) {
                grid.innerHTML = '';
                EMOJI_CATEGORIES[cat].forEach(emoji => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'play-editor-emoji-item';
                    btn.textContent = emoji;
                    btn.setAttribute('aria-label', emoji);
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
                tab.setAttribute('role', 'tab');
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

            // Position below the toolbar, aligned to the button
            editor.container.style.position = 'relative';
            const btnRect = btnEl.getBoundingClientRect();
            const containerRect = editor.container.getBoundingClientRect();
            const toolbarRect = editor.toolbar.getBoundingClientRect();
            let leftPos = btnRect.left - containerRect.left;
            const pickerWidth = 340;
            if (leftPos + pickerWidth > containerRect.width) {
                leftPos = containerRect.width - pickerWidth - 8;
            }
            if (leftPos < 0) leftPos = 0;
            picker.style.top = `${toolbarRect.bottom - containerRect.top}px`;
            picker.style.left = `${leftPos}px`;
            editor.container.appendChild(picker);

            // Show first category
            showCategory(categories[0]);

            // Close on outside click — properly tracked for cleanup
            activeCloseHandler = (e: MouseEvent) => {
                if (picker && !picker.contains(e.target as Node)) {
                    closePicker();
                }
            };
            setTimeout(() => {
                if (activeCloseHandler) {
                    document.addEventListener('mousedown', activeCloseHandler);
                }
            }, 0);
        });

        // Cleanup on destroy
        editor.onDestroy(() => closePicker());
    }
};
