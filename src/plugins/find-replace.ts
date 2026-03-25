import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const searchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

const STYLE_ID = 'play-editor-find-replace-styles';

function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .play-editor-find-panel {
            position: absolute;
            z-index: 100;
            background: #f9fafb;
            border-bottom: 1px solid #d1d5db;
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .play-editor-find-panel .find-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .play-editor-find-panel input {
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
            outline: none;
            font-family: inherit;
        }
        .play-editor-find-panel input:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .play-editor-find-panel .find-count {
            font-size: 12px;
            color: #6b7280;
            white-space: nowrap;
            min-width: 70px;
            text-align: right;
        }
        .play-editor-find-panel button {
            padding: 4px 10px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            background: #fff;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            font-family: inherit;
        }
        .play-editor-find-panel button:hover {
            background: #f3f4f6;
        }
        .play-editor-find-panel button.find-primary {
            background: #3b82f6;
            color: #fff;
            border-color: #3b82f6;
        }
        .play-editor-find-panel button.find-primary:hover {
            background: #2563eb;
        }
        .play-editor-find-panel .find-btn-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .play-editor-find-panel .find-spacer {
            flex: 1;
        }
        mark.play-editor-find-highlight {
            background: #fef08a;
            color: inherit;
            padding: 0;
        }
        mark.play-editor-find-current {
            background: #fb923c;
            color: white;
        }
    `;
    document.head.appendChild(style);
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const FindReplacePlugin: Plugin = {
    name: 'find-replace',
    init(editor: Editor) {
        injectStyles();

        let panel: HTMLDivElement | null = null;
        let currentIndex = -1;
        let matches: HTMLElement[] = [];
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let countEl: HTMLSpanElement;
        let searchInput: HTMLInputElement;
        let replaceInput: HTMLInputElement;

        function clearHighlights(): void {
            const marks = editor.editorArea.querySelectorAll('mark.play-editor-find-highlight');
            marks.forEach(mark => {
                const parent = mark.parentNode;
                while (mark.firstChild) parent?.insertBefore(mark.firstChild, mark);
                parent?.removeChild(mark);
                parent?.normalize();
            });
            matches = [];
            currentIndex = -1;
        }

        function updateCount(): void {
            if (!countEl) return;
            if (matches.length === 0) {
                const query = searchInput?.value || '';
                countEl.textContent = query ? 'No matches' : '';
            } else {
                const display = currentIndex >= 0 ? `${currentIndex + 1} of ${matches.length}` : `${matches.length} matches`;
                countEl.textContent = display;
            }
        }

        function highlightMatches(query: string): void {
            clearHighlights();
            if (!query) {
                updateCount();
                return;
            }

            const walker = document.createTreeWalker(
                editor.editorArea,
                NodeFilter.SHOW_TEXT,
                null
            );

            const textNodes: Text[] = [];
            let node: Text | null;
            while (node = walker.nextNode() as Text | null) {
                textNodes.push(node);
            }

            textNodes.forEach(textNode => {
                const text = textNode.textContent || '';
                const lowerText = text.toLowerCase();
                const lowerQuery = query.toLowerCase();
                let idx = lowerText.indexOf(lowerQuery);
                if (idx === -1) return;

                const frag = document.createDocumentFragment();
                let lastIdx = 0;

                while (idx !== -1) {
                    if (idx > lastIdx) {
                        frag.appendChild(document.createTextNode(text.substring(lastIdx, idx)));
                    }
                    const mark = document.createElement('mark');
                    mark.className = 'play-editor-find-highlight';
                    mark.textContent = text.substring(idx, idx + query.length);
                    frag.appendChild(mark);
                    lastIdx = idx + query.length;
                    idx = lowerText.indexOf(lowerQuery, lastIdx);
                }

                if (lastIdx < text.length) {
                    frag.appendChild(document.createTextNode(text.substring(lastIdx)));
                }

                textNode.parentNode?.replaceChild(frag, textNode);
            });

            matches = Array.from(editor.editorArea.querySelectorAll('mark.play-editor-find-highlight'));
            updateCount();
        }

        function goToMatch(index: number): void {
            matches.forEach(m => m.classList.remove('play-editor-find-current'));
            if (matches.length === 0) return;
            currentIndex = ((index % matches.length) + matches.length) % matches.length;
            const current = matches[currentIndex];
            current.classList.add('play-editor-find-current');
            current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            updateCount();
        }

        function replaceCurrentMatch(replacement: string): void {
            if (currentIndex < 0 || currentIndex >= matches.length) return;
            const mark = matches[currentIndex];
            const textNode = document.createTextNode(replacement);
            mark.parentNode?.replaceChild(textNode, mark);
            textNode.parentNode?.normalize();
            matches.splice(currentIndex, 1);
            if (matches.length > 0) {
                if (currentIndex >= matches.length) currentIndex = 0;
                goToMatch(currentIndex);
            } else {
                currentIndex = -1;
            }
            updateCount();
            editor.textArea.value = editor.editorArea.innerHTML;
        }

        function replaceAll(searchText: string, replacement: string): void {
            clearHighlights();
            if (!searchText) return;

            const walker = document.createTreeWalker(
                editor.editorArea,
                NodeFilter.SHOW_TEXT,
                null
            );

            const textNodes: Text[] = [];
            let n: Text | null;
            while (n = walker.nextNode() as Text | null) {
                textNodes.push(n);
            }

            const regex = new RegExp(escapeRegex(searchText), 'gi');
            textNodes.forEach(textNode => {
                const text = textNode.textContent || '';
                if (regex.test(text)) {
                    regex.lastIndex = 0;
                    textNode.textContent = text.replace(regex, replacement);
                }
            });

            editor.textArea.value = editor.editorArea.innerHTML;
            updateCount();
        }

        function debouncedSearch(): void {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                highlightMatches(searchInput.value);
            }, 200);
        }

        function buildPanel(): HTMLDivElement {
            const div = document.createElement('div');
            div.className = 'play-editor-find-panel';

            // Row 1: Search input + count
            const searchRow = document.createElement('div');
            searchRow.className = 'find-row';

            searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Find...';
            searchInput.setAttribute('aria-label', 'Search text');
            searchInput.addEventListener('input', debouncedSearch);
            searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    goToMatch(currentIndex + 1);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closePanel();
                }
            });

            countEl = document.createElement('span');
            countEl.className = 'find-count';

            searchRow.appendChild(searchInput);
            searchRow.appendChild(countEl);
            div.appendChild(searchRow);

            // Row 2: Replace input
            const replaceRow = document.createElement('div');
            replaceRow.className = 'find-row';

            replaceInput = document.createElement('input');
            replaceInput.type = 'text';
            replaceInput.placeholder = 'Replace...';
            replaceInput.setAttribute('aria-label', 'Replace text');
            replaceInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closePanel();
                }
            });

            replaceRow.appendChild(replaceInput);
            div.appendChild(replaceRow);

            // Row 3: Buttons
            const btnRow = document.createElement('div');
            btnRow.className = 'find-btn-row';

            const findNextBtn = document.createElement('button');
            findNextBtn.textContent = 'Find Next';
            findNextBtn.className = 'find-primary';
            findNextBtn.addEventListener('click', () => goToMatch(currentIndex + 1));

            const replaceBtn = document.createElement('button');
            replaceBtn.textContent = 'Replace';
            replaceBtn.addEventListener('click', () => {
                if (currentIndex < 0 && matches.length > 0) {
                    goToMatch(0);
                }
                replaceCurrentMatch(replaceInput.value);
            });

            const replaceAllBtn = document.createElement('button');
            replaceAllBtn.textContent = 'Replace All';
            replaceAllBtn.addEventListener('click', () => {
                replaceAll(searchInput.value, replaceInput.value);
            });

            const spacer = document.createElement('span');
            spacer.className = 'find-spacer';

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.addEventListener('click', () => closePanel());

            btnRow.appendChild(findNextBtn);
            btnRow.appendChild(replaceBtn);
            btnRow.appendChild(replaceAllBtn);
            btnRow.appendChild(spacer);
            btnRow.appendChild(closeBtn);
            div.appendChild(btnRow);

            return div;
        }

        function openPanel(): void {
            if (panel) {
                searchInput.focus();
                searchInput.select();
                return;
            }

            panel = buildPanel();

            const toolbarRect = editor.toolbar.getBoundingClientRect();
            const containerRect = editor.container.getBoundingClientRect();
            panel.style.top = `${toolbarRect.bottom - containerRect.top}px`;
            panel.style.left = '0';
            panel.style.right = '0';

            editor.container.appendChild(panel);
            searchInput.focus();
        }

        function closePanel(): void {
            clearHighlights();
            editor.textArea.value = editor.editorArea.innerHTML;
            if (panel) {
                panel.remove();
                panel = null;
            }
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        }

        // Toolbar button
        editor.addToolbarButton(searchIcon, 'Find & Replace', () => {
            if (panel) {
                closePanel();
            } else {
                openPanel();
            }
        });

        // Keyboard shortcut: Ctrl/Cmd+F
        const handleKeydown = (e: KeyboardEvent): void => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                openPanel();
            }
        };

        editor.editorArea.addEventListener('keydown', handleKeydown);
        editor.container.addEventListener('keydown', handleKeydown);

        editor.onDestroy(() => {
            clearHighlights();
            if (panel) panel.remove();
            if (debounceTimer) clearTimeout(debounceTimer);
            editor.editorArea.removeEventListener('keydown', handleKeydown);
            editor.container.removeEventListener('keydown', handleKeydown);
        });
    }
};
