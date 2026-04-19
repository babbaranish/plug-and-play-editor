import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';

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

const DEFAULT_CONFIG: ButtonConfig = {
    text: 'Click Here',
    url: 'https://',
    bgColor: '#3b82f6',
    textColor: '#ffffff',
    borderRadius: 4,
    paddingV: 12,
    paddingH: 24
};

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

function rgbToHex(input: string): string {
    if (!input) return '';
    if (input.startsWith('#')) return input;
    const m = input.match(/\d+/g);
    if (!m || m.length < 3) return input;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return '#' + toHex(parseInt(m[0])) + toHex(parseInt(m[1])) + toHex(parseInt(m[2]));
}

function parseButtonBlock(el: HTMLElement): ButtonConfig {
    const a = el.querySelector('a');
    if (!a) return { ...DEFAULT_CONFIG };
    const s = a.style;
    return {
        text: a.textContent || DEFAULT_CONFIG.text,
        url: a.getAttribute('href') || DEFAULT_CONFIG.url,
        bgColor: rgbToHex(s.backgroundColor) || DEFAULT_CONFIG.bgColor,
        textColor: rgbToHex(s.color) || DEFAULT_CONFIG.textColor,
        borderRadius: parseInt(s.borderRadius) || DEFAULT_CONFIG.borderRadius,
        paddingV: parseInt(s.paddingTop || s.padding) || DEFAULT_CONFIG.paddingV,
        paddingH: parseInt(s.paddingLeft || s.padding) || DEFAULT_CONFIG.paddingH
    };
}

function openButtonModal(editor: Editor, config: ButtonConfig, editingEl: HTMLElement | null, savedRange: Range | null) {
    openFormModal(editor, {
        title: editingEl ? 'Edit Button' : 'Insert Button',
        submitLabel: editingEl ? 'Update Button' : 'Insert Button',
        fields: [
            { name: 'text', label: 'Button Text', type: 'text', value: config.text, placeholder: 'Click Here' },
            { name: 'url', label: 'Button URL', type: 'url', value: config.url, placeholder: 'https://example.com' },
            [
                { name: 'bgColor', label: 'Background', type: 'color', value: config.bgColor },
                { name: 'textColor', label: 'Text Color', type: 'color', value: config.textColor }
            ],
            [
                { name: 'borderRadius', label: 'Radius', type: 'number', value: String(config.borderRadius), min: 0, max: 50 },
                { name: 'paddingV', label: 'Padding V', type: 'number', value: String(config.paddingV), min: 0, max: 80 },
                { name: 'paddingH', label: 'Padding H', type: 'number', value: String(config.paddingH), min: 0, max: 80 }
            ]
        ],
        onSubmit: (values, { showError, close }) => {
            const text = values.text.trim() || DEFAULT_CONFIG.text;
            const url = values.url.trim();
            if (!isValidUrl(url)) {
                showError('Invalid URL. Only http, https, and mailto links are allowed.');
                return;
            }

            const cfg: ButtonConfig = {
                text,
                url,
                bgColor: values.bgColor || DEFAULT_CONFIG.bgColor,
                textColor: values.textColor || DEFAULT_CONFIG.textColor,
                borderRadius: parseInt(values.borderRadius) || DEFAULT_CONFIG.borderRadius,
                paddingV: parseInt(values.paddingV) || DEFAULT_CONFIG.paddingV,
                paddingH: parseInt(values.paddingH) || DEFAULT_CONFIG.paddingH
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
            close();
        }
    });
}

export const ButtonBlockPlugin: Plugin = {
    name: 'button-block',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.buttonBlock, 'Insert Button', () => {
            const sel = window.getSelection();
            const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            openButtonModal(editor, { ...DEFAULT_CONFIG }, null, savedRange);
        });

        const editHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const block = target.closest('.play-editor-button-block') as HTMLElement | null;
            if (!block) return;
            e.preventDefault();
            openButtonModal(editor, parseButtonBlock(block), block, null);
        };
        editor.editorArea.addEventListener('click', editHandler);

        editor.onDestroy(() => {
            editor.editorArea.removeEventListener('click', editHandler);
        });
    }
};
