import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
    } catch { return false; }
}

function escapeAttr(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

interface ButtonConfig {
    text: string;
    url: string;
    bgColor: string;
    textColor: string;
    borderRadius: number;
    paddingV: number;
    paddingH: number;
}

function generateButtonHtml(cfg: ButtonConfig): string {
    const safeText = escapeAttr(cfg.text);
    const safeUrl = escapeAttr(cfg.url);
    return `<div contenteditable="false" class="play-editor-button-block" style="margin:1em 0;text-align:center;">` +
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" ` +
        `style="display:inline-block;padding:${cfg.paddingV}px ${cfg.paddingH}px;` +
        `color:${cfg.textColor};background-color:${cfg.bgColor};` +
        `border-radius:${cfg.borderRadius}px;text-decoration:none;` +
        `font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">` +
        `${safeText}</a></div>`;
}

function parseButtonBlock(el: HTMLElement): ButtonConfig {
    const a = el.querySelector('a');
    if (!a) return { text: 'Click Here', url: 'https://', bgColor: '#3b82f6', textColor: '#ffffff', borderRadius: 4, paddingV: 12, paddingH: 24 };
    const s = a.style;
    return {
        text: a.textContent || 'Click Here',
        url: a.getAttribute('href') || 'https://',
        bgColor: s.backgroundColor || '#3b82f6',
        textColor: s.color || '#ffffff',
        borderRadius: parseInt(s.borderRadius) || 4,
        paddingV: parseInt(s.paddingTop || s.padding) || 12,
        paddingH: parseInt(s.paddingLeft || s.padding) || 24,
    };
}

export const ButtonBlockPlugin: Plugin = {
    name: 'button-block',
    init(editor: Editor) {
        editor.addToolbarDivider();

        let popup: HTMLDivElement | null = null;
        let docClickHandler: ((e: MouseEvent) => void) | null = null;
        let editingEl: HTMLElement | null = null;

        function closePopup() {
            if (popup) { popup.remove(); popup = null; }
            if (docClickHandler) { document.removeEventListener('mousedown', docClickHandler); docClickHandler = null; }
            editingEl = null;
        }

        function openPopup(config: ButtonConfig, savedRange: Range | null) {
            closePopup();

            popup = document.createElement('div');
            popup.className = 'play-editor-button-popup';

            const btnRect = btnEl.getBoundingClientRect();
            const containerRect = editor.container.getBoundingClientRect();
            const toolbarRect = editor.toolbar.getBoundingClientRect();
            let leftPos = btnRect.left - containerRect.left;
            const popupWidth = 320;
            if (leftPos + popupWidth > containerRect.width) leftPos = containerRect.width - popupWidth - 8;
            if (leftPos < 0) leftPos = 0;
            popup.style.top = `${toolbarRect.bottom - containerRect.top}px`;
            popup.style.left = `${leftPos}px`;

            function field(label: string, type: string, value: string): HTMLInputElement {
                const lbl = document.createElement('label');
                lbl.className = 'play-editor-button-popup-label';
                lbl.textContent = label;
                const input = document.createElement('input');
                input.type = type;
                input.value = value;
                input.className = type === 'color' ? 'play-editor-button-popup-color' : 'play-editor-button-popup-input';
                lbl.appendChild(input);
                popup!.appendChild(lbl);
                return input;
            }

            const textInput = field('Button Text', 'text', config.text);
            const urlInput = field('Button URL', 'url', config.url);

            // Color row
            const colorRow = document.createElement('div');
            colorRow.className = 'play-editor-button-popup-row';

            const bgLabel = document.createElement('label');
            bgLabel.className = 'play-editor-button-popup-label';
            bgLabel.textContent = 'Background';
            const bgInput = document.createElement('input');
            bgInput.type = 'color';
            bgInput.value = config.bgColor;
            bgInput.className = 'play-editor-button-popup-color';
            bgLabel.appendChild(bgInput);

            const txtLabel = document.createElement('label');
            txtLabel.className = 'play-editor-button-popup-label';
            txtLabel.textContent = 'Text Color';
            const txtInput = document.createElement('input');
            txtInput.type = 'color';
            txtInput.value = config.textColor;
            txtInput.className = 'play-editor-button-popup-color';
            txtLabel.appendChild(txtInput);

            colorRow.appendChild(bgLabel);
            colorRow.appendChild(txtLabel);
            popup.appendChild(colorRow);

            // Size row
            const sizeRow = document.createElement('div');
            sizeRow.className = 'play-editor-button-popup-row';

            function numField(parent: HTMLElement, label: string, value: number): HTMLInputElement {
                const lbl = document.createElement('label');
                lbl.className = 'play-editor-button-popup-label';
                lbl.textContent = label;
                const input = document.createElement('input');
                input.type = 'number';
                input.value = String(value);
                input.min = '0';
                input.max = '50';
                input.className = 'play-editor-button-popup-input play-editor-button-popup-input-sm';
                lbl.appendChild(input);
                parent.appendChild(lbl);
                return input;
            }

            const radInput = numField(sizeRow, 'Radius', config.borderRadius);
            const padVInput = numField(sizeRow, 'Pad V', config.paddingV);
            const padHInput = numField(sizeRow, 'Pad H', config.paddingH);
            popup.appendChild(sizeRow);

            // Actions
            const actions = document.createElement('div');
            actions.className = 'play-editor-button-popup-actions';

            const insertBtn = document.createElement('button');
            insertBtn.className = 'play-editor-button-popup-submit';
            insertBtn.textContent = editingEl ? 'Update Button' : 'Insert Button';
            insertBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const text = textInput.value.trim() || 'Click Here';
                const url = urlInput.value.trim();
                if (!isValidUrl(url)) { urlInput.style.borderColor = 'red'; return; }

                const cfg: ButtonConfig = {
                    text,
                    url,
                    bgColor: bgInput.value,
                    textColor: txtInput.value,
                    borderRadius: parseInt(radInput.value) || 4,
                    paddingV: parseInt(padVInput.value) || 12,
                    paddingH: parseInt(padHInput.value) || 24,
                };

                const html = generateButtonHtml(cfg);

                if (editingEl) {
                    editingEl.outerHTML = html;
                } else {
                    if (savedRange) {
                        const s = window.getSelection();
                        s?.removeAllRanges();
                        s?.addRange(savedRange);
                    }
                    editor.editorArea.focus();
                    document.execCommand('insertHTML', false, html + '<p><br></p>');
                }
                editor.textArea.value = editor.editorArea.innerHTML;
                closePopup();
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'play-editor-button-popup-cancel';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('mousedown', (e) => { e.preventDefault(); closePopup(); });

            actions.appendChild(insertBtn);
            actions.appendChild(cancelBtn);
            popup.appendChild(actions);

            // Prevent clicks inside popup from bubbling
            popup.addEventListener('mousedown', (e) => e.stopPropagation());

            editor.container.style.position = 'relative';
            editor.container.appendChild(popup);

            setTimeout(() => textInput.focus(), 0);

            docClickHandler = (e: MouseEvent) => {
                if (popup && !popup.contains(e.target as Node)) closePopup();
            };
            setTimeout(() => { if (docClickHandler) document.addEventListener('mousedown', docClickHandler); }, 0);
        }

        const btnEl = editor.addToolbarButton(icons.buttonBlock, 'Insert Button', () => {
            if (popup) { closePopup(); return; }

            const sel = window.getSelection();
            let savedRange: Range | null = null;
            if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();

            openPopup({ text: 'Click Here', url: 'https://', bgColor: '#3b82f6', textColor: '#ffffff', borderRadius: 4, paddingV: 12, paddingH: 24 }, savedRange);
        });

        // Edit existing button blocks on click
        const editHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const block = target.closest('.play-editor-button-block') as HTMLElement | null;
            if (!block) return;
            e.preventDefault();
            editingEl = block;
            openPopup(parseButtonBlock(block), null);
        };
        editor.editorArea.addEventListener('click', editHandler);

        editor.onDestroy(() => {
            closePopup();
            editor.editorArea.removeEventListener('click', editHandler);
        });
    }
};
