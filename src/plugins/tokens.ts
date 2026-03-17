import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

export interface Token {
    /** The variable key, e.g. "first_name" — rendered as {{first_name}} */
    key: string;
    /** Human-readable label shown in the picker, e.g. "First Name" */
    label: string;
    /** Optional category for grouping in the picker */
    category?: string;
}

export interface TokensPluginOptions {
    /** List of available tokens */
    tokens: Token[];
    /** Delimiter style — default is "double-curly" which renders {{key}} */
    delimiter?: 'double-curly' | 'single-curly' | 'percent';
}

const DELIMITER_MAP = {
    'double-curly': ['{{', '}}'],
    'single-curly': ['{', '}'],
    'percent': ['%', '%'],
} as const;

export function createTokensPlugin(options: TokensPluginOptions): Plugin {
    const tokens = options.tokens;
    const [open, close] = DELIMITER_MAP[options.delimiter || 'double-curly'];

    return {
        name: 'tokens',
        init(editor: Editor) {
            editor.addToolbarDivider();

            let dropdown: HTMLDivElement | null = null;

            function closeDropdown() {
                if (dropdown) {
                    dropdown.remove();
                    dropdown = null;
                }
                if (docClickHandler) {
                    document.removeEventListener('mousedown', docClickHandler);
                    docClickHandler = null;
                }
            }

            let docClickHandler: ((e: MouseEvent) => void) | null = null;

            function insertToken(token: Token) {
                const span = document.createElement('span');
                span.className = 'play-editor-token';
                span.contentEditable = 'false';
                span.dataset.token = token.key;
                span.textContent = `${open}${token.key}${close}`;

                editor.editorArea.focus();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(span);

                    // Add a space after and move cursor there
                    const space = document.createTextNode('\u00a0');
                    span.parentNode?.insertBefore(space, span.nextSibling);

                    const newRange = document.createRange();
                    newRange.setStartAfter(space);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    editor.editorArea.appendChild(span);
                }

                editor.textArea.value = editor.editorArea.innerHTML;
                closeDropdown();
            }

            const btnEl = editor.addToolbarButton(icons.braces, 'Insert Variable', () => {
                if (dropdown) {
                    closeDropdown();
                    return;
                }

                // Save selection
                const sel = window.getSelection();
                let savedRange: Range | null = null;
                if (sel && sel.rangeCount > 0) {
                    savedRange = sel.getRangeAt(0).cloneRange();
                }

                dropdown = document.createElement('div');
                dropdown.className = 'play-editor-token-dropdown';
                dropdown.setAttribute('role', 'listbox');
                dropdown.setAttribute('aria-label', 'Template variables');

                // Position below the toolbar, aligned to the button
                const btnRect = btnEl.getBoundingClientRect();
                const containerRect = editor.container.getBoundingClientRect();
                const toolbarRect = editor.toolbar.getBoundingClientRect();
                let leftPos = btnRect.left - containerRect.left;
                // Clamp to avoid overflow on the right
                const dropdownWidth = 300;
                if (leftPos + dropdownWidth > containerRect.width) {
                    leftPos = containerRect.width - dropdownWidth - 8;
                }
                if (leftPos < 0) leftPos = 0;
                dropdown.style.top = `${toolbarRect.bottom - containerRect.top}px`;
                dropdown.style.left = `${leftPos}px`;

                // Search input
                const search = document.createElement('input');
                search.type = 'text';
                search.className = 'play-editor-token-search';
                search.placeholder = 'Search variables...';
                search.setAttribute('aria-label', 'Search variables');
                dropdown.appendChild(search);

                const list = document.createElement('div');
                list.className = 'play-editor-token-list';
                dropdown.appendChild(list);

                function renderTokens(filter: string) {
                    list.innerHTML = '';
                    const filtered = filter
                        ? tokens.filter(t =>
                            t.label.toLowerCase().includes(filter.toLowerCase()) ||
                            t.key.toLowerCase().includes(filter.toLowerCase())
                        )
                        : tokens;

                    // Group by category
                    const grouped = new Map<string, Token[]>();
                    filtered.forEach(t => {
                        const cat = t.category || '';
                        if (!grouped.has(cat)) grouped.set(cat, []);
                        grouped.get(cat)!.push(t);
                    });

                    if (filtered.length === 0) {
                        const empty = document.createElement('div');
                        empty.className = 'play-editor-token-empty';
                        empty.textContent = 'No variables found';
                        list.appendChild(empty);
                        return;
                    }

                    grouped.forEach((groupTokens, category) => {
                        if (category) {
                            const header = document.createElement('div');
                            header.className = 'play-editor-token-category';
                            header.textContent = category;
                            list.appendChild(header);
                        }

                        groupTokens.forEach(token => {
                            const item = document.createElement('div');
                            item.className = 'play-editor-token-item';
                            item.setAttribute('role', 'option');

                            const labelSpan = document.createElement('span');
                            labelSpan.className = 'play-editor-token-item-label';
                            labelSpan.textContent = token.label;

                            const keyCode = document.createElement('code');
                            keyCode.className = 'play-editor-token-item-key';
                            keyCode.textContent = `${open}${token.key}${close}`;

                            item.appendChild(labelSpan);
                            item.appendChild(keyCode);

                            item.addEventListener('mousedown', (e) => {
                                e.preventDefault();
                                // Restore selection before inserting
                                if (savedRange) {
                                    const s = window.getSelection();
                                    s?.removeAllRanges();
                                    s?.addRange(savedRange);
                                }
                                insertToken(token);
                            });
                            list.appendChild(item);
                        });
                    });
                }

                search.addEventListener('input', () => {
                    renderTokens(search.value);
                });

                // Prevent search input from stealing editor focus permanently
                search.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });

                renderTokens('');

                editor.container.style.position = 'relative';
                editor.container.appendChild(dropdown);

                // Focus search
                setTimeout(() => search.focus(), 0);

                // Close on outside click
                docClickHandler = (e: MouseEvent) => {
                    if (dropdown && !dropdown.contains(e.target as Node)) {
                        closeDropdown();
                    }
                };
                setTimeout(() => {
                    if (docClickHandler) {
                        document.addEventListener('mousedown', docClickHandler);
                    }
                }, 0);
            });

            // Cleanup on destroy
            editor.onDestroy(() => closeDropdown());
        }
    };
}

/** Default token set with common email template variables */
export const DEFAULT_EMAIL_TOKENS: Token[] = [
    { key: 'first_name', label: 'First Name', category: 'Recipient' },
    { key: 'last_name', label: 'Last Name', category: 'Recipient' },
    { key: 'full_name', label: 'Full Name', category: 'Recipient' },
    { key: 'email', label: 'Email Address', category: 'Recipient' },
    { key: 'company', label: 'Company Name', category: 'Organization' },
    { key: 'unsubscribe_url', label: 'Unsubscribe Link', category: 'Links' },
    { key: 'preferences_url', label: 'Preferences Link', category: 'Links' },
    { key: 'current_year', label: 'Current Year', category: 'Date' },
    { key: 'current_date', label: 'Current Date', category: 'Date' },
];

/** Pre-configured plugin with common email template tokens */
export const TokensPlugin = createTokensPlugin({ tokens: DEFAULT_EMAIL_TOKENS });
