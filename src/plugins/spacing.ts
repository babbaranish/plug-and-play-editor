import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

const LINE_HEIGHTS = [
    { label: '1.0', value: '1' },
    { label: '1.15', value: '1.15' },
    { label: '1.5', value: '1.5' },
    { label: '2.0', value: '2' },
    { label: '2.5', value: '2.5' },
];

const PARAGRAPH_SPACINGS = [
    { label: 'Compact', value: '0.25em' },
    { label: 'Normal', value: '0.75em' },
    { label: 'Relaxed', value: '1.5em' },
    { label: 'Double', value: '2em' },
];

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD']);

function getBlockParent(node: Node | null, boundary: HTMLElement): HTMLElement | null {
    let current = node instanceof HTMLElement ? node : node?.parentElement;
    while (current && current !== boundary) {
        if (BLOCK_TAGS.has(current.tagName)) return current;
        current = current.parentElement;
    }
    return null;
}

export const SpacingPlugin: Plugin = {
    name: 'spacing',
    init(editor: Editor) {
        let dropdown: HTMLDivElement | null = null;
        let docClickHandler: ((e: MouseEvent) => void) | null = null;

        function closeDropdown() {
            if (dropdown) { dropdown.remove(); dropdown = null; }
            if (docClickHandler) { document.removeEventListener('mousedown', docClickHandler); docClickHandler = null; }
        }

        const btnEl = editor.addToolbarButton(icons.spacing, 'Line & Paragraph Spacing', () => {
            if (dropdown) { closeDropdown(); return; }

            const sel = window.getSelection();
            let savedRange: Range | null = null;
            if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();

            dropdown = document.createElement('div');
            dropdown.className = 'play-editor-spacing-dropdown';
            dropdown.setAttribute('role', 'listbox');
            dropdown.setAttribute('aria-label', 'Spacing options');

            // Position
            const btnRect = btnEl.getBoundingClientRect();
            const containerRect = editor.container.getBoundingClientRect();
            const toolbarRect = editor.toolbar.getBoundingClientRect();
            let leftPos = btnRect.left - containerRect.left;
            const dropdownWidth = 200;
            if (leftPos + dropdownWidth > containerRect.width) leftPos = containerRect.width - dropdownWidth - 8;
            if (leftPos < 0) leftPos = 0;
            dropdown.style.top = `${toolbarRect.bottom - containerRect.top}px`;
            dropdown.style.left = `${leftPos}px`;

            function applyToBlock(styleProp: 'lineHeight' | 'marginBottom', value: string) {
                if (savedRange) {
                    const s = window.getSelection();
                    s?.removeAllRanges();
                    s?.addRange(savedRange);
                }
                const sel2 = window.getSelection();
                if (!sel2 || !sel2.anchorNode) return;
                const block = getBlockParent(sel2.anchorNode, editor.editorArea);
                if (block) {
                    block.style[styleProp] = value;
                    editor.textArea.value = editor.editorArea.innerHTML;
                }
                closeDropdown();
            }

            // Line Height section
            const lhHeader = document.createElement('div');
            lhHeader.className = 'play-editor-spacing-header';
            lhHeader.textContent = 'Line Height';
            dropdown.appendChild(lhHeader);

            const dd = dropdown;
            LINE_HEIGHTS.forEach(lh => {
                const item = document.createElement('div');
                item.className = 'play-editor-spacing-item';
                item.setAttribute('role', 'option');
                item.textContent = lh.label;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    applyToBlock('lineHeight', lh.value);
                });
                dd.appendChild(item);
            });

            // Paragraph Spacing section
            const psHeader = document.createElement('div');
            psHeader.className = 'play-editor-spacing-header';
            psHeader.textContent = 'Paragraph Spacing';
            dd.appendChild(psHeader);

            PARAGRAPH_SPACINGS.forEach(ps => {
                const item = document.createElement('div');
                item.className = 'play-editor-spacing-item';
                item.setAttribute('role', 'option');
                item.textContent = `${ps.label} (${ps.value})`;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    applyToBlock('marginBottom', ps.value);
                });
                dd.appendChild(item);
            });

            editor.container.style.position = 'relative';
            editor.container.appendChild(dropdown);

            docClickHandler = (e: MouseEvent) => {
                if (dropdown && !dropdown.contains(e.target as Node)) closeDropdown();
            };
            setTimeout(() => { if (docClickHandler) document.addEventListener('mousedown', docClickHandler); }, 0);
        });

        editor.onDestroy(() => closeDropdown());
    }
};
