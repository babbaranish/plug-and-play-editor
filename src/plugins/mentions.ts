import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

interface MentionUser {
    id: string;
    name: string;
    avatar?: string;
}

export interface MentionsPluginOptions {
    /** Provide a list of users or a function that returns users filtered by query */
    users?: MentionUser[] | ((query: string) => MentionUser[] | Promise<MentionUser[]>);
    /** Character that triggers the mention dropdown (default: '@') */
    trigger?: string;
}

const DEFAULT_USERS: MentionUser[] = [
];

export function createMentionsPlugin(options: MentionsPluginOptions = {}): Plugin {
    const trigger = options.trigger || '@';
    const usersSource = options.users || DEFAULT_USERS;

    return {
        name: 'mentions',
        init(editor: Editor) {
            // Toolbar button to manually trigger mention
            editor.addToolbarDivider();
            editor.addToolbarButton(icons.atSign, 'Mention (@)', () => {
                editor.editorArea.focus();
                editor.exec('insertHTML', trigger);
                // Trigger the input handler manually
                handleInput();
            });

            let dropdown: HTMLDivElement | null = null;

            function removeDropdown() {
                if (dropdown) {
                    dropdown.remove();
                    dropdown = null;
                }
            }

            function getCaretCoords(): { top: number; left: number } | null {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return null;
                const range = sel.getRangeAt(0).cloneRange();
                range.collapse(false);

                // Insert a temporary span to measure position
                const marker = document.createElement('span');
                marker.textContent = '\u200b'; // zero-width space
                range.insertNode(marker);

                const rect = marker.getBoundingClientRect();
                const editorRect = editor.editorArea.getBoundingClientRect();

                const coords = {
                    top: rect.bottom - editorRect.top + editor.editorArea.scrollTop,
                    left: rect.left - editorRect.left,
                };

                marker.remove();
                // Normalize to fix any split text nodes
                sel.getRangeAt(0).commonAncestorContainer.parentElement?.normalize();
                return coords;
            }

            function insertMention(user: MentionUser) {
                // Remove the @query text
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;

                const range = sel.getRangeAt(0);
                const textNode = range.startContainer;

                if (textNode.nodeType === Node.TEXT_NODE) {
                    const text = textNode.textContent || '';
                    const caretPos = range.startOffset;

                    // Find the trigger position by looking backward
                    const triggerIdx = text.lastIndexOf(trigger, caretPos);
                    if (triggerIdx !== -1) {
                        // Replace @query with the mention span
                        const before = text.substring(0, triggerIdx);
                        const after = text.substring(caretPos);

                        textNode.textContent = before;

                        const mention = document.createElement('span');
                        mention.className = 'play-editor-mention';
                        mention.contentEditable = 'false';
                        mention.dataset.userId = user.id;
                        mention.textContent = `@${user.name}`;

                        const afterNode = document.createTextNode('\u00a0' + after); // nbsp + rest

                        const parent = textNode.parentNode!;
                        parent.insertBefore(mention, textNode.nextSibling);
                        parent.insertBefore(afterNode, mention.nextSibling);

                        // Move cursor after the mention
                        const newRange = document.createRange();
                        newRange.setStart(afterNode, 1);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                }

                removeDropdown();
                editor.textArea.value = editor.editorArea.innerHTML;
            }

            async function showDropdown(query: string) {
                removeDropdown();

                let users: MentionUser[];
                if (typeof usersSource === 'function') {
                    const result = usersSource(query);
                    users = result instanceof Promise ? await result : result;
                } else {
                    users = usersSource.filter(u =>
                        u.name.toLowerCase().includes(query.toLowerCase())
                    );
                }

                if (users.length === 0) return;

                const coords = getCaretCoords();
                if (!coords) return;

                dropdown = document.createElement('div');
                dropdown.className = 'play-editor-mention-dropdown';
                dropdown.style.top = `${coords.top + 4}px`;
                dropdown.style.left = `${coords.left}px`;

                users.slice(0, 8).forEach((user, idx) => {
                    const item = document.createElement('div');
                    item.className = 'play-editor-mention-item';
                    if (idx === 0) item.classList.add('active');

                    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
                    item.innerHTML = `
                        <div class="play-editor-mention-avatar">${user.avatar ? `<img src="${user.avatar}" />` : initials}</div>
                        <span class="play-editor-mention-name">${user.name}</span>
                    `;

                    item.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        insertMention(user);
                    });

                    dropdown!.appendChild(item);
                });

                editor.editorArea.style.position = 'relative';
                editor.editorArea.appendChild(dropdown);
            }

            async function handleInput() {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                    removeDropdown();
                    return;
                }

                const range = sel.getRangeAt(0);
                const textNode = range.startContainer;

                if (textNode.nodeType !== Node.TEXT_NODE) {
                    removeDropdown();
                    return;
                }

                const text = textNode.textContent || '';
                const caretPos = range.startOffset;
                const textBeforeCaret = text.substring(0, caretPos);

                // Look for the trigger
                const triggerIdx = textBeforeCaret.lastIndexOf(trigger);

                if (triggerIdx === -1) {
                    removeDropdown();
                    return;
                }

                // Check there's no space between trigger and current position
                const query = textBeforeCaret.substring(triggerIdx + trigger.length);
                if (query.includes(' ') && query.trim().length > 0) {
                    removeDropdown();
                    return;
                }

                await showDropdown(query);
            }

            // Listen for input events
            editor.editorArea.addEventListener('input', handleInput);

            // Keyboard navigation in dropdown
            editor.editorArea.addEventListener('keydown', (e: KeyboardEvent) => {
                if (!dropdown) return;

                const items = dropdown.querySelectorAll('.play-editor-mention-item');
                const active = dropdown.querySelector('.play-editor-mention-item.active');
                let activeIdx = Array.from(items).indexOf(active as Element);

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    active?.classList.remove('active');
                    activeIdx = (activeIdx + 1) % items.length;
                    items[activeIdx].classList.add('active');
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    active?.classList.remove('active');
                    activeIdx = (activeIdx - 1 + items.length) % items.length;
                    items[activeIdx].classList.add('active');
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    if (active) {
                        e.preventDefault();
                        (active as HTMLElement).dispatchEvent(new MouseEvent('mousedown'));
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    removeDropdown();
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (dropdown && !dropdown.contains(e.target as Node)) {
                    removeDropdown();
                }
            });
        }
    };
}

// Default export with sample users for quick setup
export const MentionsPlugin = createMentionsPlugin();
